/**
 * Export utilities for Dashboard (Daily and Weekly).
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DailyDashboardSummary, ConsoResumeSummary, ResumeCoutsHebdoSummaryResponse } from "@/lib/api";
import { renderWaterChartToBase64, renderMortalityChartToBase64 } from "@/lib/chartExport";

export interface DailyDashboardExportParams {
  data: DailyDashboardSummary;
  farmName?: string;
  indiceByBatiment?: { batiment: string; sex: string; value: number | null }[];
  indiceMeanBySex?: { male: number | null; female: number | null } | null;
}

export interface DailyWaterDataPoint {
  date: string;
  dayLabel: string;
  consoEauL: number;
}

export interface DailyMortalityDataPoint {
  date: string;
  dayLabel: string;
  mortaliteNbre: number;
}

export interface WeeklyDashboardExportParams {
  farmName?: string;
  lot: string;
  week: string;
  sex?: string | null;
  costsSummary?: ResumeCoutsHebdoSummaryResponse | null;
  consoSummary?: ConsoResumeSummary | null;
  totalMortality?: number;
  mortalityPct?: number | null;
  effectifDepart?: number;
  effectifMisEnPlace?: number;
  consoAlimentKg?: number | null;
  indiceByBatiment?: { batiment: string; sex: string; value: number | null }[];
  indiceMeanBySex?: { male: number | null; female: number | null } | null;
  /** Data for Consommation d'eau chart (par jour) — used for both sexes & each sex */
  dailyWaterData?: DailyWaterDataPoint[];
  /** Data for Mortalité par jour chart — used for both sexes & each sex */
  dailyMortalityData?: DailyMortalityDataPoint[];
  /** When false (RF, Backoffice), Prix de revient section is omitted — only RT and Admin see it */
  canSeePricing?: boolean;
}

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const BORDER_THIN = { style: "thin" as const };
const BORDERS_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(decimals).replace(".", ",");
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  } catch {
    return dateStr;
  }
}

/** Format integer for PDF/Excel — uses ASCII space for thousands to avoid Unicode rendering issues (e.g. "4 / 200" instead of "4 200"). */
function formatInteger(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ============================================================================
// DAILY DASHBOARD EXPORTS — Full page content, LivraisonsAliment-style structure
// ============================================================================

function addSectionTitle(ws: import("exceljs").Worksheet, currentRow: { current: number }, text: string, colSpan = 5): number {
  ws.mergeCells(currentRow.current, 1, currentRow.current, colSpan);
  const cell = ws.getCell(currentRow.current, 1);
  cell.value = text;
  cell.font = { size: 12, bold: true, color: { argb: HEADER_TEXT } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  cell.border = BORDERS_ALL;
  cell.alignment = { horizontal: "left" };
  currentRow.current += 2;
  return currentRow.current;
}

function addInfoBlock(ws: import("exceljs").Worksheet, currentRow: { current: number }, rows: [string, string | number][]): void {
  for (const [label, value] of rows) {
    ws.getCell(currentRow.current, 1).value = label;
    ws.getCell(currentRow.current, 2).value = value;
    for (let c = 1; c <= 2; c++) {
      ws.getCell(currentRow.current, c).border = BORDERS_ALL;
      ws.getCell(currentRow.current, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
    }
    currentRow.current++;
  }
  currentRow.current++;
}

function addTable(ws: import("exceljs").Worksheet, currentRow: { current: number }, headers: string[], rows: (string | number)[][], altRows = true): void {
  const colCount = headers.length;
  for (let c = 0; c < colCount; c++) {
    const cell = ws.getCell(currentRow.current, c + 1);
    cell.value = headers[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow.current++;
  rows.forEach((row, idx) => {
    for (let c = 0; c < row.length; c++) {
      const cell = ws.getCell(currentRow.current, c + 1);
      cell.value = row[c];
      cell.border = BORDERS_ALL;
      if (altRows && idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
    }
    currentRow.current++;
  });
  currentRow.current++;
}

export async function exportDailyDashboardToExcel(params: DailyDashboardExportParams): Promise<void> {
  const { data, farmName, indiceByBatiment, indiceMeanBySex } = params;
  const effectifList = data.effectifInitialByBuildingSex ?? [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const currentRow = { current: 1 };

  const ws = workbook.addWorksheet("Dashboard du Jour", {
    views: [{ state: "frozen", ySplit: 10, activeCell: "A11", showGridLines: true }],
  });
  ws.columns = [
    { width: 26 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
  ];

  // --- 1. MAIN TITLE ---
  ws.mergeCells(currentRow.current, 1, currentRow.current, 5);
  const titleCell = ws.getCell(currentRow.current, 1);
  titleCell.value = "DASHBOARD DU JOUR";
  titleCell.font = { size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  titleCell.alignment = { horizontal: "center" };
  titleCell.border = BORDERS_ALL;
  currentRow.current += 2;

  // --- 2. INFO BLOCK ---
  const infoRows: [string, string | number][] = [];
  if (farmName) infoRows.push(["Ferme", farmName]);
  infoRows.push(["Date du rapport", formatDate(data.reportDate)]);
  infoRows.push(["Lot", data.lot || "—"]);
  if (data.ageJour != null) infoRows.push(["Âge (jours)", data.ageJour]);
  if (data.semaine != null) infoRows.push(["Semaine", `S${data.semaine}`]);
  addInfoBlock(ws, currentRow, infoRows);

  // --- 3. MORTALITÉ TOTALE DU JOUR (highlighted) ---
  addSectionTitle(ws, currentRow, "MORTALITÉ TOTALE DU JOUR", 5);
  ws.mergeCells(currentRow.current, 1, currentRow.current, 3);
  const mortCell = ws.getCell(currentRow.current, 1);
  mortCell.value = `Total des deux sexes : ${data.totalMortality}`;
  mortCell.font = { size: 12, bold: true };
  mortCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E8" } };
  mortCell.border = BORDERS_ALL;
  currentRow.current += 2;

  // --- 4. INDICE DE CONSOMMATION PAR BÂTIMENT ---
  if (indiceByBatiment && indiceByBatiment.length > 0) {
    addSectionTitle(ws, currentRow, "INDICE DE CONSOMMATION PAR BÂTIMENT", 5);
    const ibRows = indiceByBatiment.map((ib) => [ib.batiment, ib.sex, formatNumber(ib.value, 2)]);
    addTable(ws, currentRow, ["Bâtiment", "Sexe", "Indice"], ibRows);
  }

  // --- 5. MOY. INDICE DE CONSOMMATION ---
  if (indiceMeanBySex) {
    addSectionTitle(ws, currentRow, "MOY. INDICE DE CONSOMMATION — MÂLE & FEMELLE", 5);
    addTable(ws, currentRow, ["Sexe", "Moyenne"], [
      ["Mâle", formatNumber(indiceMeanBySex.male, 2)],
      ["Femelle", formatNumber(indiceMeanBySex.female, 2)],
    ]);
  }

  // --- 6. EFFECTIF INITIAL (Effectif Mis en Place) ---
  addSectionTitle(ws, currentRow, "EFFECTIF INITIAL (EFFECTIF MIS EN PLACE)", 5);
  if (effectifList.length === 0) {
    ws.getCell(currentRow.current, 1).value = "Aucune donnée";
    ws.getCell(currentRow.current, 1).font = { italic: true };
    currentRow.current += 2;
  } else {
    const totalMale = effectifList
      .filter((e) => e.sex === "Mâle" || e.sex?.toLowerCase().includes("male"))
      .reduce((s, e) => s + (e.effectifInitial ?? 0), 0);
    const totalFemale = effectifList
      .filter((e) => e.sex === "Femelle" || e.sex?.toLowerCase().includes("femelle"))
      .reduce((s, e) => s + (e.effectifInitial ?? 0), 0);
    const effectifRows = effectifList.map((e) => [e.building, e.sex, formatInteger(e.effectifInitial ?? 0)]);
    effectifRows.push(["", "Total Mâle / Femelle :", `${formatInteger(totalMale)} / ${formatInteger(totalFemale)}`]);
    effectifRows.push(["", "Total général :", formatInteger(totalMale + totalFemale)]);
    addTable(ws, currentRow, ["Bâtiment", "Sexe", "Effectif initial"], effectifRows, false);
  }

  // --- 7. MÉTRIQUES PAR SEXE (Mâle & Femelle — Mortalité, Eau, Temp, Traitement) ---
  addSectionTitle(ws, currentRow, "MÉTRIQUES PAR SEXE", 5);
  const sexHeaders = ["Sexe", "Mortalité (NBR)", "Conso. Eau (L)", "Temp. Min (°C)", "Temp. Max (°C)", "Traitement"];
  const sexRows = (data.sexMetrics ?? []).map((sm) => [
    sm.sex || "—",
    String(sm.mortalityCount),
    formatNumber(sm.waterConsumption, 0),
    formatNumber(sm.tempMin, 1),
    formatNumber(sm.tempMax, 1),
    (sm.traitement ?? "").toString().trim() || "—",
  ]);
  if (sexRows.length === 0) {
    ws.getCell(currentRow.current, 1).value = "Aucune donnée";
    ws.getCell(currentRow.current, 1).font = { italic: true };
    currentRow.current += 2;
  } else {
    addTable(ws, currentRow, sexHeaders, sexRows);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Dashboard_Jour_${safeFileName([data.lot, formatDate(data.reportDate)])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportDailyDashboardToPdf(params: DailyDashboardExportParams): void {
  const { data, farmName, indiceByBatiment, indiceMeanBySex } = params;
  const effectifList = data.effectifInitialByBuildingSex ?? [];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 210;

  // --- HEADER BANNER ---
  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 20, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("DASHBOARD DU JOUR", margin, 14);

  // --- INFO BLOCK ---
  doc.setFillColor(225, 224, 219);
  doc.rect(0, 20, pageWidth, 8, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const infoParts: string[] = [];
  if (farmName) infoParts.push(`Ferme: ${farmName}`);
  infoParts.push(`Date: ${formatDate(data.reportDate)}`);
  infoParts.push(`Lot: ${data.lot || "—"}`);
  if (data.ageJour != null) infoParts.push(`Âge: ${data.ageJour} jours`);
  if (data.semaine != null) infoParts.push(`Semaine: S${data.semaine}`);
  doc.text(infoParts.join("  |  "), margin, 26);

  let y = 32;
  const tableMargin = { left: margin, right: margin };
  const tableTheme = {
    theme: "grid" as const,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  };

  // --- 1. MORTALITÉ TOTALE DU JOUR ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(38, 36, 21);
  doc.text("MORTALITÉ TOTALE DU JOUR", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(`Total des deux sexes : ${data.totalMortality}`, margin, y);
  y += 10;

  // --- 2. INDICE DE CONSOMMATION PAR BÂTIMENT ---
  if (indiceByBatiment && indiceByBatiment.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("INDICE DE CONSOMMATION PAR BÂTIMENT", margin, y);
    y += 6;
    const body1 = indiceByBatiment.map((ib) => [ib.batiment, ib.sex, formatNumber(ib.value, 2)]);
    autoTable(doc, {
      head: [["Bâtiment", "Sexe", "Indice"]],
      body: body1,
      startY: y,
      margin: tableMargin,
      ...tableTheme,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 3. MOY. INDICE DE CONSOMMATION ---
  if (indiceMeanBySex) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("MOY. INDICE DE CONSOMMATION — MÂLE & FEMELLE", margin, y);
    y += 6;
    autoTable(doc, {
      head: [["Sexe", "Moyenne"]],
      body: [
        ["Mâle", formatNumber(indiceMeanBySex.male, 2)],
        ["Femelle", formatNumber(indiceMeanBySex.female, 2)],
      ],
      startY: y,
      margin: tableMargin,
      ...tableTheme,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 4. EFFECTIF INITIAL (Effectif Mis en Place) ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("EFFECTIF INITIAL (EFFECTIF MIS EN PLACE)", margin, y);
  y += 6;
  if (effectifList.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Aucune donnée", margin, y);
    y += 8;
  } else {
    const totalMale = effectifList
      .filter((e) => e.sex === "Mâle" || e.sex?.toLowerCase().includes("male"))
      .reduce((s, e) => s + (e.effectifInitial ?? 0), 0);
    const totalFemale = effectifList
      .filter((e) => e.sex === "Femelle" || e.sex?.toLowerCase().includes("femelle"))
      .reduce((s, e) => s + (e.effectifInitial ?? 0), 0);
    const body2 = effectifList.map((e) => [
      e.building,
      e.sex,
      formatInteger(e.effectifInitial ?? 0),
    ]);
    body2.push(["", "Total Mâle / Femelle :", `${formatInteger(totalMale)} / ${formatInteger(totalFemale)}`]);
    body2.push(["", "Total général :", formatInteger(totalMale + totalFemale)]);
    autoTable(doc, {
      head: [["Bâtiment", "Sexe", "Effectif initial"]],
      body: body2,
      startY: y,
      margin: tableMargin,
      ...tableTheme,
      didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle?: string; fillColor?: number[] } } }) => {
        if (data.section === "body" && data.row.index >= effectifList.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [216, 214, 208];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 5. MÉTRIQUES PAR SEXE ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("MÉTRIQUES PAR SEXE", margin, y);
  y += 6;
  const sexMetrics = data.sexMetrics ?? [];
  if (sexMetrics.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Aucune donnée", margin, y);
  } else {
    const body3 = sexMetrics.map((sm) => [
      sm.sex || "—",
      String(sm.mortalityCount),
      formatNumber(sm.waterConsumption, 0),
      formatNumber(sm.tempMin, 1),
      formatNumber(sm.tempMax, 1),
      (sm.traitement ?? "").toString().trim() || "—",
    ]);
    autoTable(doc, {
      head: [["Sexe", "Mortalité (NBR)", "Conso. Eau (L)", "Temp. Min (°C)", "Temp. Max (°C)", "Traitement"]],
      body: body3,
      startY: y,
      margin: tableMargin,
      ...tableTheme,
    });
  }

  doc.save(`Dashboard_Jour_${safeFileName([data.lot, formatDate(data.reportDate)])}.pdf`);
}

// ============================================================================
// WEEKLY DASHBOARD EXPORTS — Structured for Both sexes & Each sex (Mâle / Femelle)
// ============================================================================

function getSexLabel(sex: string | null | undefined): string {
  if (!sex) return "Les deux (Mâle + Femelle)";
  return sex;
}

function extractBase64FromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
}

export async function exportWeeklyDashboardToExcel(params: WeeklyDashboardExportParams): Promise<void> {
  const { farmName, lot, week, sex, costsSummary, consoSummary, totalMortality, mortalityPct, effectifDepart, effectifMisEnPlace, consoAlimentKg, indiceByBatiment, indiceMeanBySex, dailyWaterData, dailyMortalityData, canSeePricing } = params;

  const indiceFiltered = sex != null && indiceByBatiment
    ? indiceByBatiment.filter((ib) => ib.sex === sex)
    : indiceByBatiment ?? [];
  const sexLabel = getSexLabel(sex);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const currentRow = { current: 1 };

  const ws = workbook.addWorksheet("Dashboard Hebdo", {
    views: [{ state: "frozen", ySplit: 14, activeCell: "A15", showGridLines: true }],
  });
  ws.columns = [
    { width: 32 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
  ];

  // --- 1. MAIN TITLE ---
  ws.mergeCells(currentRow.current, 1, currentRow.current, 4);
  const titleCell = ws.getCell(currentRow.current, 1);
  titleCell.value = "DASHBOARD HEBDOMADAIRE";
  titleCell.font = { size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  titleCell.alignment = { horizontal: "center" };
  titleCell.border = BORDERS_ALL;
  currentRow.current += 2;

  // --- 2. INFO BLOCK ---
  const infoRows: [string, string | number][] = [];
  if (farmName) infoRows.push(["Ferme", farmName]);
  infoRows.push(["Lot", lot]);
  infoRows.push(["Semaine", week]);
  infoRows.push(["Filtre Sexe", sexLabel]);
  addInfoBlock(ws, currentRow, infoRows);

  // --- 3. INDICATEURS CLÉS (KPIs) ---
  addSectionTitle(ws, currentRow, "INDICATEURS CLÉS", 4);
  const kpiRows: [string, string | number][] = [];
  if (effectifDepart != null) kpiRows.push(["Effectif départ de " + week, formatInteger(effectifDepart)]);
  if (effectifMisEnPlace != null) kpiRows.push(["Effectif mis en place", formatInteger(effectifMisEnPlace)]);
  if (costsSummary?.effectifRestantFinSemaine != null) kpiRows.push(["Effectif restant fin de semaine", formatInteger(costsSummary.effectifRestantFinSemaine)]);
  if (costsSummary?.totalNbreProduction != null) kpiRows.push(["Total des oiseaux livrés", formatInteger(costsSummary.totalNbreProduction)]);
  if (totalMortality != null) kpiRows.push(["Mortalité cumulative", formatInteger(totalMortality)]);
  if (mortalityPct != null) kpiRows.push(["Mortalité (%)", formatNumber(mortalityPct, 2) + " %"]);
  if (consoAlimentKg != null) kpiRows.push(["Consommation aliment (kg/sem)", formatNumber(consoAlimentKg, 0)]);
  addInfoBlock(ws, currentRow, kpiRows);

  // --- 4. COÛTS HEBDOMADAIRES ---
  if (costsSummary?.costLines && costsSummary.costLines.length > 0) {
    addSectionTitle(ws, currentRow, "COÛTS HEBDOMADAIRES", 4);
    const costRows = costsSummary.costLines.map((line) => [line.designation || "—", formatNumber(line.valeurS1, 2), formatNumber(line.cumul, 2)]);
    addTable(ws, currentRow, ["Désignation", "Valeur " + week, "Cumul"], costRows);
  }

  // --- 5. CONSOMMATION HEBDOMADAIRE (Conso. Aliment Semaine only, filtered by sex) ---
  if (consoSummary) {
    addSectionTitle(ws, currentRow, "CONSOMMATION HEBDOMADAIRE", 4);
    const consoRows: (string | number)[][] = [];
    if (sex === "Mâle" && consoSummary.consoAlimentSemaineMale != null) {
      consoRows.push(["Conso. Aliment Semaine (Mâle)", formatNumber(consoSummary.consoAlimentSemaineMale, 0) + " kg"]);
    } else if (sex === "Femelle" && consoSummary.consoAlimentSemaineFemelle != null) {
      consoRows.push(["Conso. Aliment Semaine (Femelle)", formatNumber(consoSummary.consoAlimentSemaineFemelle, 0) + " kg"]);
    } else if (!sex && consoSummary.consoAlimentSemaineSum != null) {
      consoRows.push(["Conso. Aliment Semaine (Total)", formatNumber(consoSummary.consoAlimentSemaineSum, 0) + " kg"]);
    }
    if (consoRows.length > 0) addTable(ws, currentRow, ["Métrique", "Valeur"], consoRows);
  }

  // --- 6. INDICE DE CONSOMMATION PAR BÂTIMENT ---
  if (indiceFiltered.length > 0) {
    const sectionTitle = sex != null ? `INDICE DE CONSOMMATION PAR BÂTIMENT — ${sex}` : "INDICE DE CONSOMMATION PAR BÂTIMENT";
    addSectionTitle(ws, currentRow, sectionTitle, 4);
    const ibRows = indiceFiltered.map((ib) => [ib.batiment, ib.sex, formatNumber(ib.value, 2)]);
    addTable(ws, currentRow, ["Bâtiment", "Sexe", "Indice"], ibRows);
  }

  // --- 7. MOY. INDICE DE CONSOMMATION ---
  if (indiceMeanBySex) {
    const sectionTitle = sex != null ? `MOY. INDICE DE CONSOMMATION — ${sex}` : "MOY. INDICE DE CONSOMMATION — MÂLE & FEMELLE";
    addSectionTitle(ws, currentRow, sectionTitle, 4);
    const meanRows: (string | number)[][] = [];
    if (sex === "Mâle" || !sex) meanRows.push(["Mâle", formatNumber(indiceMeanBySex.male, 2)]);
    if (sex === "Femelle" || !sex) meanRows.push(["Femelle", formatNumber(indiceMeanBySex.female, 2)]);
    if (meanRows.length > 0) addTable(ws, currentRow, ["Sexe", "Moyenne"], meanRows);
  }

  // --- 8. PRIX DE REVIENT (RT & Admin only — RF and Backoffice do not see it) ---
  if (canSeePricing && (costsSummary?.prixRevientParSujet != null || costsSummary?.prixRevientParKg != null)) {
    addSectionTitle(ws, currentRow, "PRIX DE REVIENT", 4);
    const prixRows: (string | number)[][] = [];
    if (costsSummary.prixRevientParSujet != null) prixRows.push(["Prix de revient / sujet", formatNumber(costsSummary.prixRevientParSujet, 2) + " DH"]);
    if (costsSummary.prixRevientParKg != null) prixRows.push(["Prix de revient / kg", formatNumber(costsSummary.prixRevientParKg, 2) + " DH"]);
    if (prixRows.length > 0) addTable(ws, currentRow, ["Métrique", "Valeur"], prixRows);
  }

  // --- 9. DIAGRAMMES (Consommation d'eau & Mortalité par jour) ---
  const sexLabelChart = getSexLabel(sex);
  const waterImg = dailyWaterData?.length ? renderWaterChartToBase64(dailyWaterData, week, sexLabelChart) : null;
  const mortalityImg = dailyMortalityData?.length ? renderMortalityChartToBase64(dailyMortalityData, week, sexLabelChart) : null;
  if (waterImg || mortalityImg) {
    if (waterImg) {
      addSectionTitle(ws, currentRow, "CONSOMMATION D'EAU PAR JOUR", 4);
      const chartRow0 = currentRow.current - 1;
      const waterId = workbook.addImage({ base64: extractBase64FromDataUrl(waterImg), extension: "png" });
      ws.addImage(waterId, {
        tl: { col: 0, row: chartRow0 },
        ext: { width: 420, height: 220 },
      });
      currentRow.current += Math.ceil(220 / 15) + 2;
    }
    if (mortalityImg) {
      addSectionTitle(ws, currentRow, "MORTALITÉ PAR JOUR", 4);
      const mortRow0 = currentRow.current - 1;
      const mortId = workbook.addImage({ base64: extractBase64FromDataUrl(mortalityImg), extension: "png" });
      ws.addImage(mortId, {
        tl: { col: 0, row: mortRow0 },
        ext: { width: 420, height: 220 },
      });
      currentRow.current += Math.ceil(220 / 15) + 2;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Dashboard_Hebdo_${safeFileName([lot, week, sex ?? "Les_deux"])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const CHART_WIDTH_MM = 170;
const CHART_HEIGHT_MM = 58;

export function exportWeeklyDashboardToPdf(params: WeeklyDashboardExportParams): void {
  const { farmName, lot, week, sex, costsSummary, consoSummary, totalMortality, mortalityPct, effectifDepart, effectifMisEnPlace, consoAlimentKg, indiceByBatiment, indiceMeanBySex, dailyWaterData, dailyMortalityData, canSeePricing } = params;

  const indiceFiltered = sex != null && indiceByBatiment ? indiceByBatiment.filter((ib) => ib.sex === sex) : indiceByBatiment ?? [];
  const sexLabel = getSexLabel(sex);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 210;

  const tableMargin = { left: margin, right: margin };
  const tableTheme = {
    theme: "grid" as const,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  };

  // --- HEADER BANNER ---
  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 20, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("DASHBOARD HEBDOMADAIRE", margin, 14);

  // --- INFO BLOCK ---
  doc.setFillColor(225, 224, 219);
  doc.rect(0, 20, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const infoParts: string[] = [];
  if (farmName) infoParts.push(`Ferme: ${farmName}`);
  infoParts.push(`Lot: ${lot}`);
  infoParts.push(`Semaine: ${week}`);
  infoParts.push(`Filtre Sexe: ${sexLabel}`);
  doc.text(infoParts.join("  |  "), margin, 27);

  let y = 34;

  const addSection = (title: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(38, 36, 21);
    doc.text(title, margin, y);
    y += 6;
  };

  // --- 1. INDICATEURS CLÉS ---
  addSection("INDICATEURS CLÉS");
  const kpiRows: string[][] = [];
  if (effectifDepart != null) kpiRows.push(["Effectif départ de " + week, formatInteger(effectifDepart)]);
  if (effectifMisEnPlace != null) kpiRows.push(["Effectif mis en place", formatInteger(effectifMisEnPlace)]);
  if (costsSummary?.effectifRestantFinSemaine != null) kpiRows.push(["Effectif restant fin de semaine", formatInteger(costsSummary.effectifRestantFinSemaine)]);
  if (costsSummary?.totalNbreProduction != null) kpiRows.push(["Total des oiseaux livrés", formatInteger(costsSummary.totalNbreProduction)]);
  if (totalMortality != null) kpiRows.push(["Mortalité cumulative", formatInteger(totalMortality)]);
  if (mortalityPct != null) kpiRows.push(["Mortalité (%)", formatNumber(mortalityPct, 2) + " %"]);
  if (consoAlimentKg != null) kpiRows.push(["Consommation aliment (kg/sem)", formatNumber(consoAlimentKg, 0)]);
  if (kpiRows.length > 0) {
    autoTable(doc, { head: [["Indicateur", "Valeur"]], body: kpiRows, startY: y, margin: tableMargin, ...tableTheme });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 2. COÛTS HEBDOMADAIRES ---
  if (costsSummary?.costLines && costsSummary.costLines.length > 0) {
    addSection("COÛTS HEBDOMADAIRES");
    const body = costsSummary.costLines.map((line) => [line.designation || "—", formatNumber(line.valeurS1, 2), formatNumber(line.cumul, 2)]);
    autoTable(doc, { head: [["Désignation", "Valeur " + week, "Cumul"]], body, startY: y, margin: tableMargin, ...tableTheme });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 3. CONSOMMATION HEBDOMADAIRE (Conso. Aliment Semaine only, filtered by sex) ---
  if (consoSummary) {
    const consoBody: string[][] = [];
    if (sex === "Mâle" && consoSummary.consoAlimentSemaineMale != null) {
      consoBody.push(["Conso. Aliment Semaine (Mâle)", formatNumber(consoSummary.consoAlimentSemaineMale, 0) + " kg"]);
    } else if (sex === "Femelle" && consoSummary.consoAlimentSemaineFemelle != null) {
      consoBody.push(["Conso. Aliment Semaine (Femelle)", formatNumber(consoSummary.consoAlimentSemaineFemelle, 0) + " kg"]);
    } else if (!sex && consoSummary.consoAlimentSemaineSum != null) {
      consoBody.push(["Conso. Aliment Semaine (Total)", formatNumber(consoSummary.consoAlimentSemaineSum, 0) + " kg"]);
    }
    if (consoBody.length > 0) {
      addSection("CONSOMMATION HEBDOMADAIRE");
      autoTable(doc, { head: [["Métrique", "Valeur"]], body: consoBody, startY: y, margin: tableMargin, ...tableTheme });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // --- 4. INDICE DE CONSOMMATION PAR BÂTIMENT ---
  if (indiceFiltered.length > 0) {
    addSection(sex != null ? `INDICE DE CONSOMMATION PAR BÂTIMENT — ${sex}` : "INDICE DE CONSOMMATION PAR BÂTIMENT");
    const body = indiceFiltered.map((ib) => [ib.batiment, ib.sex, formatNumber(ib.value, 2)]);
    autoTable(doc, { head: [["Bâtiment", "Sexe", "Indice"]], body, startY: y, margin: tableMargin, ...tableTheme });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // --- 5. MOY. INDICE DE CONSOMMATION ---
  if (indiceMeanBySex) {
    addSection(sex != null ? `MOY. INDICE DE CONSOMMATION — ${sex}` : "MOY. INDICE DE CONSOMMATION — MÂLE & FEMELLE");
    const body: string[][] = [];
    if (sex === "Mâle" || !sex) body.push(["Mâle", formatNumber(indiceMeanBySex.male, 2)]);
    if (sex === "Femelle" || !sex) body.push(["Femelle", formatNumber(indiceMeanBySex.female, 2)]);
    if (body.length > 0) {
      autoTable(doc, { head: [["Sexe", "Moyenne"]], body, startY: y, margin: tableMargin, ...tableTheme });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // --- 6. PRIX DE REVIENT (RT & Admin only — RF and Backoffice do not see it) ---
  if (canSeePricing && (costsSummary?.prixRevientParSujet != null || costsSummary?.prixRevientParKg != null)) {
    addSection("PRIX DE REVIENT");
    const body: string[][] = [];
    if (costsSummary.prixRevientParSujet != null) body.push(["Prix de revient / sujet", formatNumber(costsSummary.prixRevientParSujet, 2) + " DH"]);
    if (costsSummary.prixRevientParKg != null) body.push(["Prix de revient / kg", formatNumber(costsSummary.prixRevientParKg, 2) + " DH"]);
    if (body.length > 0) {
      autoTable(doc, { head: [["Métrique", "Valeur"]], body, startY: y, margin: tableMargin, ...tableTheme });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // --- 7. DIAGRAMMES (Consommation d'eau & Mortalité par jour) — Page 2 ---
  const sexLabelChart = getSexLabel(sex);
  const waterImg = dailyWaterData?.length ? renderWaterChartToBase64(dailyWaterData, week, sexLabelChart) : null;
  const mortalityImg = dailyMortalityData?.length ? renderMortalityChartToBase64(dailyMortalityData, week, sexLabelChart) : null;
  if (waterImg || mortalityImg) {
    doc.addPage();
    y = 34;
    if (waterImg) {
      addSection("CONSOMMATION D'EAU PAR JOUR");
      doc.addImage(waterImg, "PNG", margin, y, CHART_WIDTH_MM, CHART_HEIGHT_MM);
      y += CHART_HEIGHT_MM + 12;
    }
    if (mortalityImg) {
      addSection("MORTALITÉ PAR JOUR");
      doc.addImage(mortalityImg, "PNG", margin, y, CHART_WIDTH_MM, CHART_HEIGHT_MM);
    }
  }

  doc.save(`Dashboard_Hebdo_${safeFileName([lot, week, sex ?? "Les_deux"])}.pdf`);
}
