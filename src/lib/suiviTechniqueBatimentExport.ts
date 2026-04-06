/**
 * Export utilities for Suivi Technique Hebdomadaire — per bâtiment and sex.
 * Fetches data from APIs and generates Excel/PDF.
 * Table organization mirrors the page layout: Setup, Effectif départ, Suivi hebdomadaire, Production, Consommation, Performances, Stock.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "@/lib/api";
import { fetchMortaliteCumulFinSemainePrecedente } from "@/lib/mortalitePrevWeekCumul";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";
import {
  SUIVI_HEBDO_DATA_COLUMN_COUNT,
  SUIVI_HEBDO_EXPORT_HEADERS,
} from "@/lib/suiviTechniqueHebdomadaireShared";

export interface SuiviTechniqueBatimentExportParams {
  farmName: string;
  farmId: number;
  lot: string;
  semaine: string;
  batiment: string;
  sex: string;
}

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const TOTAL_BG = "FFD8D6D0";
const BORDER_THIN = { style: "thin" as const };
const BORDERS_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function formatVal(v: number | null | undefined, unit?: string): string {
  if (v == null || Number.isNaN(v)) return "—";
  const s = Number.isInteger(v) ? formatGroupedNumber(v, 0) : formatGroupedNumber(v, 2);
  return unit ? `${s} ${unit}` : s;
}

function formatPctExport(p: number): string {
  return `${formatGroupedNumber(p, 2)} %`;
}

function safeStr(v: string | null | undefined): string {
  return v != null && String(v).trim() !== "" ? String(v).trim() : "—";
}

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

function isSemaineS1(semaine: string): boolean {
  return /^S1$/i.test(semaine.trim());
}

function mortaliteTransportPctStr(
  cumul: number,
  effectifDepart: number | null | undefined
): string {
  if (cumul == null || Number.isNaN(cumul)) return "—";
  const ef = effectifDepart != null ? Number(effectifDepart) : NaN;
  if (!Number.isFinite(ef) || ef <= 0) return "—";
  return formatPctExport((cumul / ef) * 100);
}

/**
 * Calculate mortalité de transport starting point:
 * - S1: First day's mortalité NBRE (starting point for cumul)
 * - S2+: Previous week's ending cumul (starting point for cumul)
 *
 * IMPORTANT: This function must produce identical results for all batiments.
 * The only difference between batiments is the data fetched from the API,
 * not the calculation logic.
 */
function getMortaliteTransportStartingPoint(semaine: string, hebdoList: any[], prevWeekCumul: number): number {
  const n = parseSemaineIndex(semaine);
  if (n == null || n <= 1) {
    // S1: Get FIRST row WITH a valid mortalité NBRE value
    const sorted = (hebdoList ?? [])
      .filter((r) => r.recordDate && r.recordDate.trim() !== "")
      .sort((a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? ""));
    
    // Find first row with a valid mortaliteNbre
    for (const row of sorted) {
      if (row.mortaliteNbre != null) {
        let firstRowNbre: number | null = null;
        if (typeof row.mortaliteNbre === "number") {
          firstRowNbre = row.mortaliteNbre;
        } else if (typeof row.mortaliteNbre === "string") {
          const parsed = parseInt(row.mortaliteNbre, 10);
          firstRowNbre = Number.isFinite(parsed) ? parsed : null;
        }
        if (firstRowNbre != null && firstRowNbre >= 0) {
          return firstRowNbre;
        }
      }
    }
    return 0;
  } else {
    // S2+: Use previous week's ending cumul
    // Ensure prevWeekCumul is a valid number
    if (typeof prevWeekCumul === "number" && Number.isFinite(prevWeekCumul)) {
      return prevWeekCumul;
    }
    return 0;
  }
}

function parseSemaineIndex(semaine: string): number | null {
  const m = semaine.trim().match(/^S(\d+)$/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export async function exportToExcel(params: SuiviTechniqueBatimentExportParams): Promise<void> {
  const { farmName, farmId, lot, semaine, batiment, sex } = params;
  
  // Validate required parameters - all batiments must have these
  if (!farmId || !lot?.trim() || !semaine?.trim() || !batiment?.trim() || !sex?.trim()) {
    console.error("Export parameters missing or invalid", { farmId, lot, semaine, batiment, sex });
    throw new Error("Invalid export parameters: all fields required");
  }

  const [setup, hebdoList, transportCumulExport, production, consumption, performance, stock] = await Promise.all([
    api.suiviTechniqueSetup.getBySex({ farmId, lot, semaine, sex, batiment }),
    api.suiviTechniqueHebdo.list({ farmId, lot, sex, batiment, semaine }),
    fetchMortaliteCumulFinSemainePrecedente(farmId, lot, sex, batiment, semaine),
    api.suiviProductionHebdo.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviConsommationHebdo.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviPerformancesHebdo.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviStock.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
  ]);

  /** Effectif départ de [semaine] = first hebdo record's effectifDepart */
  const effectifDepart =
    (hebdoList ?? []).length > 0
      ? (hebdoList ?? []).filter((r) => r.effectifDepart != null).sort((a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? ""))[0]?.effectifDepart
      : null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const ws = workbook.addWorksheet("Suivi technique", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true }] });
  ws.columns = [
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },  // MORT. CUMUL
    { width: 18 },  // MORT. % CUMUL
    { width: 18 },  // CONSO. EAU (L)
    { width: 16 },  // T° MIN
    { width: 16 },  // T° MAX
    { width: 20 },  // VACCINATION
    { width: 20 },  // TRAITEMENT
    { width: 24 },  // OBSERVATION
  ];

  let row = 1;
  const addTitle = (text: string, colSpan = SUIVI_HEBDO_DATA_COLUMN_COUNT) => {
    ws.mergeCells(row, 1, row, colSpan);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { size: 12, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
    cell.alignment = { horizontal: "left" };
    row += 2;
  };
  const addInfoRow = (label: string, value: string | number) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 2).value = value;
    for (let c = 1; c <= 2; c++) {
      ws.getCell(row, c).border = BORDERS_ALL;
      ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E6E1" } };
    }
    row++;
  };
  const addTableHeader = (headers: string[]) => {
    for (let c = 0; c < headers.length; c++) {
      const cell = ws.getCell(row, c + 1);
      cell.value = headers[c];
      cell.font = { bold: true, color: { argb: HEADER_TEXT } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
      cell.border = BORDERS_ALL;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
    row++;
  };
  const addDataRow = (values: (string | number)[], isAlt = false) => {
    for (let c = 0; c < values.length; c++) {
      const cell = ws.getCell(row, c + 1);
      cell.value = values[c];
      cell.border = BORDERS_ALL;
      if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
    }
    row++;
  };

  addTitle(`SUIVI TECHNIQUE HEBDOMADAIRE — ${batiment} — ${sex} — ${semaine}`);
  addInfoRow("Ferme", farmName || "—");
  addInfoRow("Lot", lot || "—");
  addInfoRow("Semaine", semaine || "—");
  row++;

  addTitle("1. Données mises en place — Configuration initiale");
  if (setup) {
    addInfoRow("Type d'élevage", setup.typeElevage ?? "—");
    addInfoRow("Date d'éclosion", setup.dateEclosion ?? "—");
    addInfoRow("Heure de mise en place", setup.heureMiseEnPlace ?? "—");
    addInfoRow("Date de mise en place", setup.dateMiseEnPlace ?? "—");
    addInfoRow("Souche", setup.souche ?? "—");
    addInfoRow(
      "Effectif mis en place",
      setup.effectifMisEnPlace != null ? formatGroupedNumber(setup.effectifMisEnPlace, 0) : "—"
    );
    addInfoRow("Fournisseur", setup.origineFournisseur ?? "—");
  } else {
    addInfoRow("—", "Aucune donnée");
  }
  row++;

  addTitle(`2. Effectif départ de ${semaine}`);
  addInfoRow(
    `Effectif départ de ${semaine}`,
    effectifDepart != null ? formatGroupedNumber(effectifDepart, 0) : "—"
  );
  row++;

  addTitle(`3. Suivi hebdomadaire — ${sex} — ${semaine}`);
  const hebdoHeaders = [...SUIVI_HEBDO_EXPORT_HEADERS];
  addTableHeader(hebdoHeaders);
  
  const sortedHebdo = (hebdoList ?? []).filter((r) => r.recordDate && r.mortaliteNbre != null).sort((a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? ""));
  const mortaliteTransportStartingPoint = getMortaliteTransportStartingPoint(semaine, sortedHebdo, transportCumulExport);
  const transportPctExport = mortaliteTransportPctStr(mortaliteTransportStartingPoint, effectifDepart);
  const TRANSPORT_CUMUL_BG = "FFFEF9C4";
  ws.mergeCells(row, 1, row, 4);
  ws.getCell(row, 1).value = "MORTALITE DU TRANSPORT";
  ws.getCell(row, 1).font = { bold: true };
  ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= SUIVI_HEBDO_DATA_COLUMN_COUNT; c++) {
    ws.getCell(row, c).border = BORDERS_ALL;
  }
  ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
  ws.getCell(row, 5).value = formatGroupedNumber(mortaliteTransportStartingPoint, 0);
  ws.getCell(row, 5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TRANSPORT_CUMUL_BG } };
  ws.getCell(row, 5).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(row, 6).value = transportPctExport;
  ws.getCell(row, 6).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 7; c <= SUIVI_HEBDO_DATA_COLUMN_COUNT; c++) {
    ws.getCell(row, c).value = "";
  }
  row++;
  for (let i = 0; i < sortedHebdo.length; i++) {
    const r = sortedHebdo[i]!;
    const mortalitePct = r.mortalitePct != null ? formatPctExport(r.mortalitePct) : "—";
    const mortaliteCumulPct = r.mortaliteCumulPct != null ? formatPctExport(r.mortaliteCumulPct) : "—";
    addDataRow(
      [
        r.recordDate ?? "—",
        r.ageJour != null ? formatGroupedNumber(r.ageJour, 0) : "—",
        r.mortaliteNbre != null ? formatGroupedNumber(r.mortaliteNbre, 0) : "—",
        mortalitePct,
        r.mortaliteCumul != null ? formatGroupedNumber(r.mortaliteCumul, 0) : "—",
        mortaliteCumulPct,
        r.consoEauL != null ? formatGroupedNumber(r.consoEauL, 2) : "—",
        r.tempMin != null ? formatGroupedNumber(r.tempMin, 2) : "—",
        r.tempMax != null ? formatGroupedNumber(r.tempMax, 2) : "—",
        safeStr(r.vaccination),
        safeStr(r.traitement),
        safeStr(r.observation),
      ],
      i % 2 === 1
    );
  }
  if (sortedHebdo.length === 0) {
    addDataRow(["Aucune donnée", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—"]);
  }
  
  // Calculate total mortality: robust handling for string or number types
  const totalMort = sortedHebdo.reduce((s, r) => {
    let val = 0;
    if (r.mortaliteNbre != null) {
      if (typeof r.mortaliteNbre === "number") {
        val = r.mortaliteNbre;
      } else if (typeof r.mortaliteNbre === "string") {
        const parsed = parseInt(r.mortaliteNbre, 10);
        val = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    return s + val;
  }, 0);
  
  // Calculate total water consumption: robust handling for string or number types
  const totalEau = sortedHebdo.reduce((s, r) => {
    let val = 0;
    if (r.consoEauL != null) {
      if (typeof r.consoEauL === "number") {
        val = r.consoEauL;
      } else if (typeof r.consoEauL === "string") {
        const parsed = parseFloat(r.consoEauL);
        val = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    return s + val;
  }, 0);
  
  // Get the final cumulative value from the last row
  let finalCumul = 0;
  if (sortedHebdo.length > 0) {
    const lastRow = sortedHebdo[sortedHebdo.length - 1];
    // Try to use last row's cumulative value if valid
    if (lastRow?.mortaliteCumul != null) {
      if (typeof lastRow.mortaliteCumul === "number") {
        finalCumul = lastRow.mortaliteCumul;
      } else if (typeof lastRow.mortaliteCumul === "string") {
        const parsed = parseInt(lastRow.mortaliteCumul, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          finalCumul = parsed;
        }
      }
    }
    // If no valid cumulative from last row, calculate from starting point
    if (finalCumul === 0 && sortedHebdo.length > 0) {
      const startingPoint = getMortaliteTransportStartingPoint(semaine, sortedHebdo, transportCumulExport);
      finalCumul = startingPoint + totalMort;
    }
  }
  
  // Calculate percentages for total row
  const totalMortPct = effectifDepart != null && effectifDepart > 0 ? (totalMort / effectifDepart) * 100 : null;
  const finalCumulPct = effectifDepart != null && effectifDepart > 0 ? (finalCumul / effectifDepart) * 100 : null;
  
  if (sortedHebdo.length > 0) {
    ws.getCell(row, 1).value = `TOTAL ${semaine}`;
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    ws.getCell(row, 3).value = formatGroupedNumber(totalMort, 0);
    ws.getCell(row, 4).value = totalMortPct != null ? formatPctExport(totalMortPct) : "—";
    ws.getCell(row, 5).value = formatGroupedNumber(finalCumul, 0);
    ws.getCell(row, 6).value = finalCumulPct != null ? formatPctExport(finalCumulPct) : "—";
    ws.getCell(row, 7).value = formatGroupedNumber(totalEau, 2);
    for (let c = 1; c <= hebdoHeaders.length; c++) {
      ws.getCell(row, c).border = BORDERS_ALL;
      if (c !== 1) ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    }
    row++;
  }
  row++;

  addTitle("4. Suivi de la livraison — Production");
  addTableHeader(["INDICATEUR", "NB", "POIDS (kg)"]);
  const prodRows: [string, string, string][] = [
    [
      "REPORT",
      production?.reportNbre != null ? formatGroupedNumber(production.reportNbre, 0) : "—",
      production?.reportPoids != null ? formatGroupedNumber(Number(production.reportPoids), 2) : "—",
    ],
    [
      "VENTE",
      production?.venteNbre != null ? formatGroupedNumber(production.venteNbre, 0) : "—",
      production?.ventePoids != null ? formatGroupedNumber(Number(production.ventePoids), 2) : "—",
    ],
    [
      "CONSOMMATION employeur",
      production?.consoNbre != null ? formatGroupedNumber(production.consoNbre, 0) : "—",
      production?.consoPoids != null ? formatGroupedNumber(Number(production.consoPoids), 2) : "—",
    ],
    [
      "AUTRE gratuit",
      production?.autreNbre != null ? formatGroupedNumber(production.autreNbre, 0) : "—",
      production?.autrePoids != null ? formatGroupedNumber(Number(production.autrePoids), 2) : "—",
    ],
    [
      "TOTAL",
      production?.totalNbre != null ? formatGroupedNumber(production.totalNbre, 0) : "—",
      production?.totalPoids != null ? formatGroupedNumber(Number(production.totalPoids), 2) : "—",
    ],
  ];
  prodRows.forEach(([label, nb, poids], i) => {
    addDataRow([label, nb, poids], i % 2 === 1);
    if (label === "TOTAL") {
      ws.getCell(row - 1, 1).font = { bold: true };
      ws.getCell(row - 1, 1).fill = ws.getCell(row - 1, 2).fill = ws.getCell(row - 1, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    }
  });
  row++;

  addTitle("5. Consommation");
  addTableHeader(["INDICATEUR", "VALEUR"]);
  const consoRows: [string, string][] = [
    ["CONSOMME ALIMENT (kg)", formatVal(consumption?.consommationAlimentSemaine)],
    ["CUMUL ALIMENT CONSOMME", formatVal(consumption?.cumulAlimentConsomme)],
    ["INDICE EAU/ALIMENT", formatVal(consumption?.indiceEauAliment)],
  ];
  consoRows.forEach(([label, val], i) => addDataRow([label, val], i % 2 === 1));
  row++;

  addTitle("6. Performances");
  addTableHeader(["INDICATEUR", "REEL", "NORME", "ÉCART"]);
  const perfRows: [string, string, string, string][] = performance
    ? [
        ["POIDS MOYEN (g)", formatVal(performance.poidsMoyenReel, "g"), formatVal(performance.poidsMoyenNorme, "g"), formatVal(performance.poidsMoyenEcart, "g")],
        ["HOMOGÉNÉITÉ (%)", formatVal(performance.homogeneiteReel, "%"), formatVal(performance.homogeneiteNorme, "%"), formatVal(performance.homogeneiteEcart, "%")],
        ["INDICE DE CONSOMMATION", formatVal(performance.indiceConsommationReel), formatVal(performance.indiceConsommationNorme), formatVal(performance.indiceConsommationEcart)],
        ["GMQ (g/jour)", formatVal(performance.gmqReel, "g/j"), formatVal(performance.gmqNorme, "g/j"), formatVal(performance.gmqEcart, "g/j")],
        ["VIABILITÉ (%)", formatVal(performance.viabiliteReel, "%"), formatVal(performance.viabiliteNorme, "%"), formatVal(performance.viabiliteEcart, "%")],
      ]
    : [["—", "Aucune donnée", "—", "—"]];
  perfRows.forEach((row, i) => addDataRow(row, i % 2 === 1));
  row++;

  addTitle("7. Stock");
  addTableHeader(["INDICATEUR", "VALEUR"]);
  const stockRows: [string, string][] = stock
    ? [
        ["Effectif restant fin de semaine", formatVal(stock.effectifRestantFinSemaine)],
        ["Poids vif produit (kg)", formatVal(stock.poidsVifProduitKg)],
        ["Stock aliment", formatVal(stock.stockAliment)],
      ]
    : [["—", "Aucune donnée"]];
  stockRows.forEach(([label, val], i) => addDataRow([label, val], i % 2 === 1));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Suivi_Technique_${batiment}_${sex}_${safeFileName([lot, semaine])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportToPdf(params: SuiviTechniqueBatimentExportParams): Promise<void> {
  const { farmName, farmId, lot, semaine, batiment, sex } = params;
  
  // Validate required parameters - all batiments must have these
  if (!farmId || !lot?.trim() || !semaine?.trim() || !batiment?.trim() || !sex?.trim()) {
    console.error("Export parameters missing or invalid", { farmId, lot, semaine, batiment, sex });
    throw new Error("Invalid export parameters: all fields required");
  }

  const [setup, hebdoList, transportCumulPdf, production, consumption, performance, stock] = await Promise.all([
    api.suiviTechniqueSetup.getBySex({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviTechniqueHebdo.list({ farmId, lot, sex, batiment, semaine }).catch(() => []),
    fetchMortaliteCumulFinSemainePrecedente(farmId, lot, sex, batiment, semaine),
    api.suiviProductionHebdo.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviConsommationHebdo.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviPerformancesHebdo.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
    api.suiviStock.get({ farmId, lot, semaine, sex, batiment }).catch(() => null),
  ]);

  const effectifDepart =
    (hebdoList ?? []).length > 0
      ? (hebdoList ?? []).filter((r) => r.effectifDepart != null).sort((a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? ""))[0]?.effectifDepart
      : null;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 297;
  const lastY = () => (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 0;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("SUIVI TECHNIQUE HEBDOMADAIRE", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 18, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Semaine: ${semaine || "—"}  |  Bâtiment: ${batiment || "—"}  |  Sexe: ${sex || "—"}`, margin, 24);

  let y = 32;
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("1. Données mises en place — Configuration initiale", margin, y);
  y += 6;
  const setupBody: [string, string][] = setup
    ? [
        ["Type d'élevage", setup.typeElevage ?? "—"],
        ["Date d'éclosion", setup.dateEclosion ?? "—"],
        ["Heure de mise en place", setup.heureMiseEnPlace ?? "—"],
        ["Date de mise en place", setup.dateMiseEnPlace ?? "—"],
        ["Souche", setup.souche ?? "—"],
        ["Effectif mis en place", formatGroupedNumber(setup.effectifMisEnPlace, 0)],
        ["Fournisseur", setup.origineFournisseur ?? "—"],
      ]
    : [["—", "Aucune donnée"]];
  autoTable(doc, {
    head: [["CHAMP", "VALEUR"]],
    body: setupBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text(
    `2. Effectif départ de ${semaine}: ${effectifDepart != null ? formatGroupedNumber(effectifDepart, 0) : "—"}`,
    margin,
    y
  );
  y += 8;

  const sortedHebdo = (hebdoList ?? []).filter((r) => r.recordDate && r.mortaliteNbre != null).sort((a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? ""));
  doc.setFont("helvetica", "bold");
  doc.text(`3. Suivi hebdomadaire — ${sex} — ${semaine}`, margin, y);
  y += 6;
  const hebdoHeaders = [...SUIVI_HEBDO_EXPORT_HEADERS];
  const mortaliteTransportStartingPointPdf = getMortaliteTransportStartingPoint(semaine, sortedHebdo, transportCumulPdf);
  const transportPctPdf = mortaliteTransportPctStr(mortaliteTransportStartingPointPdf, effectifDepart);
  const transportRowPdf: string[] = [
    "MORTALITE DU TRANSPORT",
    "",
    "",
    "",
    formatGroupedNumber(mortaliteTransportStartingPointPdf, 0),
    transportPctPdf,
    "—",
    "—",
    "—",
    "—",
    "—",
    "—",
  ];
  const hebdoBody: string[][] = [
    transportRowPdf,
    ...sortedHebdo.map((r) => {
      const mortalitePct = r.mortalitePct != null ? formatPctExport(r.mortalitePct) : "—";
      const mortaliteCumulPct = r.mortaliteCumulPct != null ? formatPctExport(r.mortaliteCumulPct) : "—";
      return [
        r.recordDate ?? "—",
        r.ageJour != null ? formatGroupedNumber(r.ageJour, 0) : "—",
        r.mortaliteNbre != null ? formatGroupedNumber(r.mortaliteNbre, 0) : "—",
        mortalitePct,
        r.mortaliteCumul != null ? formatGroupedNumber(r.mortaliteCumul, 0) : "—",
        mortaliteCumulPct,
        r.consoEauL != null ? formatGroupedNumber(r.consoEauL, 2) : "—",
        r.tempMin != null ? formatGroupedNumber(r.tempMin, 2) : "—",
        r.tempMax != null ? formatGroupedNumber(r.tempMax, 2) : "—",
        safeStr(r.vaccination),
        safeStr(r.traitement),
        safeStr(r.observation),
      ];
    }),
  ];
  if (sortedHebdo.length === 0) {
    hebdoBody.push(["Aucune donnée", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—", "—"]);
  } else {
    // Calculate total mortality: robust handling for string or number types
    const totalMort = sortedHebdo.reduce((s, r) => {
      let val = 0;
      if (r.mortaliteNbre != null) {
        if (typeof r.mortaliteNbre === "number") {
          val = r.mortaliteNbre;
        } else if (typeof r.mortaliteNbre === "string") {
          const parsed = parseInt(r.mortaliteNbre, 10);
          val = Number.isFinite(parsed) ? parsed : 0;
        }
      }
      return s + val;
    }, 0);
    
    // Calculate total water consumption: robust handling for string or number types
    const totalEau = sortedHebdo.reduce((s, r) => {
      let val = 0;
      if (r.consoEauL != null) {
        if (typeof r.consoEauL === "number") {
          val = r.consoEauL;
        } else if (typeof r.consoEauL === "string") {
          const parsed = parseFloat(r.consoEauL);
          val = Number.isFinite(parsed) ? parsed : 0;
        }
      }
      return s + val;
    }, 0);
    
    // Get the final cumulative value from the last row
    let finalCumul = 0;
    const lastRow = sortedHebdo[sortedHebdo.length - 1];
    // Try to use last row's cumulative value if valid
    if (lastRow?.mortaliteCumul != null) {
      if (typeof lastRow.mortaliteCumul === "number") {
        finalCumul = lastRow.mortaliteCumul;
      } else if (typeof lastRow.mortaliteCumul === "string") {
        const parsed = parseInt(lastRow.mortaliteCumul, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          finalCumul = parsed;
        }
      }
    }
    // If no valid cumulative from last row, calculate from starting point
    if (finalCumul === 0 && sortedHebdo.length > 0) {
      const startingPoint = getMortaliteTransportStartingPoint(semaine, sortedHebdo, transportCumulPdf);
      finalCumul = startingPoint + totalMort;
    }
    
    // Calculate percentages for total row
    const totalMortPct = effectifDepart != null && effectifDepart > 0 ? (totalMort / effectifDepart) * 100 : null;
    const finalCumulPct = effectifDepart != null && effectifDepart > 0 ? (finalCumul / effectifDepart) * 100 : null;
    
    hebdoBody.push([
      `TOTAL ${semaine}`,
      "—",
      formatGroupedNumber(totalMort, 0),
      totalMortPct != null ? formatPctExport(totalMortPct) : "—",
      formatGroupedNumber(finalCumul, 0),
      finalCumulPct != null ? formatPctExport(finalCumulPct) : "—",
      formatGroupedNumber(totalEau, 2),
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
  }
  autoTable(doc, {
    head: [hebdoHeaders],
    body: hebdoBody.map((row) => row.map(String)),
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 7 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
    didParseCell: (data) => {
      if (
        data.section === "body" &&
        sortedHebdo.length > 0 &&
        data.row.index === hebdoBody.length - 1
      ) {
        (data.cell.styles as { fontStyle?: string; fillColor?: number[] }).fontStyle = "bold";
        (data.cell.styles as { fontStyle?: string; fillColor?: number[] }).fillColor = [216, 214, 208];
      }
    },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text("4. Suivi de la livraison — Production", margin, y);
  y += 6;
  const prodBody: [string, string, string][] = production
    ? [
        [
          "REPORT",
          production.reportNbre != null ? formatGroupedNumber(production.reportNbre, 0) : "—",
          production.reportPoids != null ? formatGroupedNumber(Number(production.reportPoids), 2) : "—",
        ],
        [
          "VENTE",
          production.venteNbre != null ? formatGroupedNumber(production.venteNbre, 0) : "—",
          production.ventePoids != null ? formatGroupedNumber(Number(production.ventePoids), 2) : "—",
        ],
        [
          "CONSOMMATION employeur",
          production.consoNbre != null ? formatGroupedNumber(production.consoNbre, 0) : "—",
          production.consoPoids != null ? formatGroupedNumber(Number(production.consoPoids), 2) : "—",
        ],
        [
          "AUTRE gratuit",
          production.autreNbre != null ? formatGroupedNumber(production.autreNbre, 0) : "—",
          production.autrePoids != null ? formatGroupedNumber(Number(production.autrePoids), 2) : "—",
        ],
        [
          "TOTAL",
          production.totalNbre != null ? formatGroupedNumber(production.totalNbre, 0) : "—",
          production.totalPoids != null ? formatGroupedNumber(Number(production.totalPoids), 2) : "—",
        ],
      ]
    : [["—", "Aucune donnée", "—"]];
  autoTable(doc, {
    head: [["INDICATEUR", "NB", "POIDS (kg)"]],
    body: prodBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === prodBody.length - 1) {
        (data.cell.styles as { fontStyle?: string; fillColor?: number[] }).fontStyle = "bold";
        (data.cell.styles as { fontStyle?: string; fillColor?: number[] }).fillColor = [216, 214, 208];
      }
    },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text("5. Consommation", margin, y);
  y += 6;
  const consoBody: [string, string][] = consumption
    ? [
        ["CONSOMME ALIMENT (kg)", formatVal(consumption.consommationAlimentSemaine)],
        ["CUMUL ALIMENT CONSOMME", formatVal(consumption.cumulAlimentConsomme)],
        ["INDICE EAU/ALIMENT", formatVal(consumption.indiceEauAliment)],
      ]
    : [["—", "Aucune donnée"]];
  autoTable(doc, {
    head: [["INDICATEUR", "VALEUR"]],
    body: consoBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text("6. Performances", margin, y);
  y += 6;
  const perfBody: [string, string, string, string][] = performance
    ? [
        ["POIDS MOYEN (g)", formatVal(performance.poidsMoyenReel, "g"), formatVal(performance.poidsMoyenNorme, "g"), formatVal(performance.poidsMoyenEcart, "g")],
        ["HOMOGÉNÉITÉ (%)", formatVal(performance.homogeneiteReel, "%"), formatVal(performance.homogeneiteNorme, "%"), formatVal(performance.homogeneiteEcart, "%")],
        ["INDICE DE CONSOMMATION", formatVal(performance.indiceConsommationReel), formatVal(performance.indiceConsommationNorme), formatVal(performance.indiceConsommationEcart)],
        ["GMQ (g/jour)", formatVal(performance.gmqReel, "g/j"), formatVal(performance.gmqNorme, "g/j"), formatVal(performance.gmqEcart, "g/j")],
        ["VIABILITÉ (%)", formatVal(performance.viabiliteReel, "%"), formatVal(performance.viabiliteNorme, "%"), formatVal(performance.viabiliteEcart, "%")],
      ]
    : [["—", "Aucune donnée", "—", "—"]];
  autoTable(doc, {
    head: [["INDICATEUR", "REEL", "NORME", "ÉCART"]],
    body: perfBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text("7. Stock", margin, y);
  y += 6;
  const stockBody: [string, string][] = stock
    ? [
        ["Effectif restant fin de semaine", formatVal(stock.effectifRestantFinSemaine)],
        ["Poids vif produit (kg)", formatVal(stock.poidsVifProduitKg)],
        ["Stock aliment", formatVal(stock.stockAliment)],
      ]
    : [["—", "Aucune donnée"]];
  autoTable(doc, {
    head: [["INDICATEUR", "VALEUR"]],
    body: stockBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });

  doc.save(`Suivi_Technique_${batiment}_${sex}_${safeFileName([lot, semaine])}.pdf`);
}
