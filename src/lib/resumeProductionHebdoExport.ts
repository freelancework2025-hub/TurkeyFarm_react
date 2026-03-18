/**
 * Export utilities for Résumé hebdomadaire de la production.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface ResumeProductionHebdoExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  batiments: string[];
  /** Données mises en place */
  setup: { dateMiseEnPlace: string; souche: string; effectifMisEnPlace: number };
  totalEffectifDepart: number;
  /** Suivi hebdomadaire rows */
  weeklyRows: {
    recordDate: string;
    ageJour: number | null;
    mortaliteNbre: number;
    mortalitePct: string;
    mortaliteCumul: number;
    mortaliteCumulPct: string;
    consoEauL: number;
    tempMin: number | null;
    tempMax: number | null;
    vaccination: string | null;
    traitement: string | null;
    observation: string | null;
  }[];
  weeklyTotals: { totalMortality: number; totalWater: number };
  /** Suivi performances */
  performance: {
    consoAlimentSemaineSum: number | null;
    cumulAlimentConsommeSum: number | null;
    indiceEauAliment: number | null;
    poidsMoyenG: number | null;
    indiceConsommation: number | null;
    gmqGParJour: number | null;
    viabilite: number | null;
    consoAlimentKgParJ: number | null;
  };
  /** Suivi livraison */
  production: { reportNbre: number; reportPoids: number; venteNbre: number; ventePoids: number; consoNbre: number; consoPoids: number; autreNbre: number; autrePoids: number; totalNbre: number; totalPoids: number };
  /** Stock */
  stock: { effectifRestantFinSemaine: number | null; poidsVifProduitKg: number; stockAliment: number | null };
  /** Contrôle stocks */
  controleStock: { quantiteLivree: number; qlStock: number | null; ecart: number | null };
}

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const TOTAL_BG = "FFD8D6D0";
const BORDER_THIN = { style: "thin" as const };
const BORDERS_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function formatVal(value: number | null | undefined, unit?: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const s = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

export async function exportToExcel(params: ResumeProductionHebdoExportParams): Promise<void> {
  const { farmName, lot, semaine, batiments, setup, totalEffectifDepart, weeklyRows, weeklyTotals, performance, production, stock, controleStock } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  let currentRow = 1;

  const addTitle = (ws: ExcelJS.Worksheet, text: string) => {
    ws.mergeCells(currentRow, 1, currentRow, 5);
    const cell = ws.getCell(currentRow, 1);
    cell.value = text;
    cell.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
    currentRow += 2;
  };

  const addInfoBlock = (ws: ExcelJS.Worksheet, rows: [string, string | number][]) => {
    for (const [label, value] of rows) {
      ws.getCell(currentRow, 1).value = label;
      ws.getCell(currentRow, 2).value = value;
      for (let c = 1; c <= 2; c++) {
        ws.getCell(currentRow, c).border = BORDERS_ALL;
        ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
      }
      currentRow++;
    }
    currentRow++;
  };

  const ws = workbook.addWorksheet("Résumé production", { views: [{ state: "frozen", ySplit: 10, activeCell: "A11", showGridLines: true }] });
  ws.columns = [
    { width: 14 },  // DATE
    { width: 12 },  // ÂGE (J)
    { width: 14 },  // MORTALITÉ NBRE
    { width: 12 },  // MORTALITÉ %
    { width: 12 },  // CUMUL
    { width: 12 },  // CUMUL %
    { width: 14 },  // CONSO. EAU (L)
    { width: 10 },  // T° MIN
    { width: 10 },  // T° MAX
    { width: 28 },  // VACCINATION — grand
    { width: 32 },  // TRAITEMENT — sequentially grand
    { width: 36 },  // OBSERVATION — sequentially grand
  ];

  addTitle(ws, "RÉSUMÉ HEBDOMADAIRE DE LA PRODUCTION");
  addInfoBlock(ws, [
    ["Ferme", farmName || "—"],
    ["Lot", lot || "—"],
    ["Semaine", semaine || "—"],
    ["Bâtiments", batiments.join(", ") || "—"],
  ]);

  addTitle(ws, "1. Données mises en place — Configuration initiale");
  addInfoBlock(ws, [
    ["Date de mise en place", setup.dateMiseEnPlace],
    ["Souche", setup.souche],
    ["Effectif mis en place", setup.effectifMisEnPlace],
  ]);

  addTitle(ws, `2. Effectif départ de ${semaine}`);
  addInfoBlock(ws, [["Effectif départ", totalEffectifDepart]]);

  addTitle(ws, `3. Suivi hebdomadaire — Tous bâtiments — ${semaine}`);
  const weeklyHeaders = [
    "DATE",
    "ÂGE (J)",
    "MORTALITÉ NBRE",
    "MORTALITÉ %",
    "CUMUL",
    "CUMUL %",
    "CONSO. EAU (L)",
    "T° MIN",
    "T° MAX",
    "VACCINATION",
    "TRAITEMENT",
    "OBSERVATION",
  ];
  const weeklyColCount = weeklyHeaders.length;
  for (let c = 0; c < weeklyColCount; c++) {
    const cell = ws.getCell(currentRow, c + 1);
    cell.value = weeklyHeaders[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow++;
  const startWeekly = currentRow;
  let weeklyIdx = 0;
  const safeStr = (s: string | null | undefined) => (s?.trim() ? s.trim() : "—");
  for (const r of weeklyRows) {
    ws.getCell(currentRow, 1).value = r.recordDate;
    ws.getCell(currentRow, 2).value = r.ageJour ?? "—";
    ws.getCell(currentRow, 3).value = r.mortaliteNbre;
    ws.getCell(currentRow, 4).value = r.mortalitePct ? `${r.mortalitePct.replace(".", ",")} %` : "—";
    ws.getCell(currentRow, 5).value = r.mortaliteCumul;
    ws.getCell(currentRow, 6).value = r.mortaliteCumulPct ? `${r.mortaliteCumulPct.replace(".", ",")} %` : "—";
    ws.getCell(currentRow, 7).value = r.consoEauL;
    ws.getCell(currentRow, 8).value = r.tempMin != null ? r.tempMin : "—";
    ws.getCell(currentRow, 9).value = r.tempMax != null ? r.tempMax : "—";
    ws.getCell(currentRow, 10).value = safeStr(r.vaccination);
    ws.getCell(currentRow, 11).value = safeStr(r.traitement);
    ws.getCell(currentRow, 12).value = safeStr(r.observation);
    for (let c = 1; c <= weeklyColCount; c++) {
      ws.getCell(currentRow, c).border = BORDERS_ALL;
      if (weeklyIdx % 2 === 1) ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
    }
    currentRow++;
    weeklyIdx++;
  }
  const totalPct =
    totalEffectifDepart > 0
      ? `${((weeklyTotals.totalMortality / totalEffectifDepart) * 100).toFixed(2).replace(".", ",")} %`
      : "—";
  ws.getCell(currentRow, 1).value = `TOTAL ${semaine}`;
  ws.getCell(currentRow, 2).value = "—";
  ws.getCell(currentRow, 3).value = weeklyTotals.totalMortality;
  ws.getCell(currentRow, 4).value = totalPct;
  ws.getCell(currentRow, 5).value = weeklyTotals.totalMortality;
  ws.getCell(currentRow, 6).value = totalPct;
  ws.getCell(currentRow, 7).value = weeklyTotals.totalWater;
  ws.getCell(currentRow, 8).value = "—";
  ws.getCell(currentRow, 9).value = "—";
  ws.getCell(currentRow, 10).value = "—";
  ws.getCell(currentRow, 11).value = "—";
  ws.getCell(currentRow, 12).value = "—";
  for (let c = 1; c <= weeklyColCount; c++) {
    ws.getCell(currentRow, c).font = { bold: true };
    ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    ws.getCell(currentRow, c).border = BORDERS_ALL;
  }
  currentRow += 2;

  addTitle(ws, `4. Suivi de PERFORMANCES — ${semaine}`);
  const perfRows: [string, string | number][] = [
    [`CONSOMME ALIMENT ${semaine}`, formatVal(performance.consoAlimentSemaineSum, "kg")],
    [`CUMUL ALIMENT CONSOMME ${semaine}`, formatVal(performance.cumulAlimentConsommeSum, "kg")],
    ["INDICE EAU/ALIMENT", formatVal(performance.indiceEauAliment)],
    ["POIDS MOYEN (g)", formatVal(performance.poidsMoyenG, "g")],
    ["I.CONSOMMATION", formatVal(performance.indiceConsommation)],
    ["GMQ (g/jour)", formatVal(performance.gmqGParJour, "g/jour")],
    ["VIABILITE", formatVal(performance.viabilite, "%")],
    ["CONSO ALIMENT Kg/J", formatVal(performance.consoAlimentKgParJ, "Kg/J")],
  ];
  addInfoBlock(ws, perfRows);

  addTitle(ws, `5. Suivi de la livraison — Tous bâtiments — ${semaine}`);
  const prodHeaders = ["INDICATEUR", "NB", "POIDS (kg)"];
  for (let c = 0; c < prodHeaders.length; c++) {
    const cell = ws.getCell(currentRow, c + 1);
    cell.value = prodHeaders[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow++;
  const prodBody = [
    ["REPORT", production.reportNbre, production.reportPoids],
    ["VENTE", production.venteNbre, production.ventePoids],
    ["CONSOMMATION employeur", production.consoNbre, production.consoPoids],
    ["AUTRE gratuit", production.autreNbre, production.autrePoids],
    ["TOTAL", production.totalNbre, production.totalPoids],
  ];
  let prodIdx = 0;
  for (const [label, nb, poids] of prodBody) {
    ws.getCell(currentRow, 1).value = label;
    ws.getCell(currentRow, 2).value = nb;
    ws.getCell(currentRow, 3).value = Number.isFinite(poids) ? poids : 0;
    for (let c = 1; c <= 3; c++) {
      ws.getCell(currentRow, c).border = BORDERS_ALL;
      if (label === "TOTAL") {
        ws.getCell(currentRow, c).font = { bold: true };
        ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      } else if (prodIdx % 2 === 1) {
        ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
    }
    currentRow++;
    prodIdx++;
  }
  currentRow++;

  addTitle(ws, `6. STOCK — Tous bâtiments — ${semaine}`);
  addInfoBlock(ws, [
    ["Effectif restant fin de semaine", formatVal(stock.effectifRestantFinSemaine)],
    ["Poids vif produit (kg)", formatVal(stock.poidsVifProduitKg)],
    ["Stock aliment", formatVal(stock.stockAliment)],
  ]);

  addTitle(ws, `7. Contrôle des stocks — ${semaine}`);
  addInfoBlock(ws, [
    ["Quantité livrée", formatVal(controleStock.quantiteLivree)],
    ["QL-Stock", formatVal(controleStock.qlStock)],
    ["Écart", formatVal(controleStock.ecart)],
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Resume_Production_Hebdo_${safeFileName([farmName, `Lot${lot}`, semaine])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: ResumeProductionHebdoExportParams): void {
  const { farmName, lot, semaine, batiments, setup, totalEffectifDepart, weeklyRows, weeklyTotals, performance, production, stock, controleStock } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 210;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 16, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RÉSUMÉ HEBDOMADAIRE DE LA PRODUCTION", margin, 10);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 16, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Semaine: ${semaine || "—"}  |  Bâtiments: ${batiments.join(", ") || "—"}`, margin, 22);

  let y = 32;
  doc.setTextColor(0, 0, 0);
  const lastY = () => (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("1. Données mises en place — Configuration initiale", margin, y);
  y += 6;
  const setupBody: [string, string][] = [
    ["Date de mise en place", setup.dateMiseEnPlace ?? "—"],
    ["Souche", setup.souche ?? "—"],
    ["Effectif mis en place", String(setup.effectifMisEnPlace ?? "—")],
  ];
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
  doc.text(`2. Effectif départ de ${semaine}`, margin, y);
  y += 6;
  autoTable(doc, {
    head: [["INDICATEUR", "VALEUR"]],
    body: [["Effectif départ", String(totalEffectifDepart)]],
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text(`3. Suivi hebdomadaire — Tous bâtiments — ${semaine}`, margin, y);
  y += 6;
  const pdfSafeStr = (s: string | null | undefined) => (s?.trim() ? s.trim() : "—");
  const weeklyHeaders = [
    "DATE",
    "ÂGE (J)",
    "MORT. NBRE",
    "MORT. %",
    "CUMUL",
    "CUMUL %",
    "CONSO. EAU (L)",
    "T° MIN",
    "T° MAX",
    "VACCINATION",
    "TRAITEMENT",
    "OBSERVATION",
  ];
  const weeklyBody = weeklyRows.map((r) => [
    r.recordDate,
    r.ageJour ?? "—",
    r.mortaliteNbre,
    r.mortalitePct ? `${r.mortalitePct} %` : "—",
    r.mortaliteCumul,
    r.mortaliteCumulPct ? `${r.mortaliteCumulPct} %` : "—",
    r.consoEauL.toFixed(1),
    r.tempMin != null ? r.tempMin : "—",
    r.tempMax != null ? r.tempMax : "—",
    pdfSafeStr(r.vaccination),
    pdfSafeStr(r.traitement),
    pdfSafeStr(r.observation),
  ]);
  const totalPct =
    totalEffectifDepart > 0
      ? `${((weeklyTotals.totalMortality / totalEffectifDepart) * 100).toFixed(2)} %`
      : "—";
  weeklyBody.push([
    `TOTAL ${semaine}`,
    "—",
    String(weeklyTotals.totalMortality),
    totalPct,
    String(weeklyTotals.totalMortality),
    totalPct,
    weeklyTotals.totalWater.toFixed(1),
    "—",
    "—",
    "—",
    "—",
    "—",
  ]);

  autoTable(doc, {
    head: [weeklyHeaders],
    body: weeklyBody.map((row) => row.map(String)),
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === weeklyBody.length - 1) {
        (data.cell.styles as { fontStyle?: string; fillColor?: number[] }).fontStyle = "bold";
        (data.cell.styles as { fontStyle?: string; fillColor?: number[] }).fillColor = [216, 214, 208];
      }
    },
  });
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text("4. Suivi de PERFORMANCES — " + semaine, margin, y);
  y += 6;
  const perfBody: [string, string][] = [
    [`CONSOMME ALIMENT ${semaine}`, formatVal(performance.consoAlimentSemaineSum, "kg")],
    [`CUMUL ALIMENT CONSOMME ${semaine}`, formatVal(performance.cumulAlimentConsommeSum, "kg")],
    ["INDICE EAU/ALIMENT", formatVal(performance.indiceEauAliment)],
    ["POIDS MOYEN (g)", formatVal(performance.poidsMoyenG, "g")],
    ["I.CONSOMMATION", formatVal(performance.indiceConsommation)],
    ["GMQ (g/jour)", formatVal(performance.gmqGParJour, "g/jour")],
    ["VIABILITE", formatVal(performance.viabilite, "%")],
    ["CONSO ALIMENT Kg/J", formatVal(performance.consoAlimentKgParJ, "Kg/J")],
  ];
  autoTable(doc, {
    head: [["INDICATEUR", "VALEUR"]],
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
  doc.text("5. Suivi de la livraison — Tous bâtiments — " + semaine, margin, y);
  y += 6;
  const prodBody: [string, string, string][] = [
    ["REPORT", String(production.reportNbre ?? "—"), String(production.reportPoids ?? "—")],
    ["VENTE", String(production.venteNbre ?? "—"), String(production.ventePoids ?? "—")],
    ["CONSOMMATION employeur", String(production.consoNbre ?? "—"), String(production.consoPoids ?? "—")],
    ["AUTRE gratuit", String(production.autreNbre ?? "—"), String(production.autrePoids ?? "—")],
    ["TOTAL", String(production.totalNbre ?? "—"), String(production.totalPoids ?? "—")],
  ];
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
  doc.text("6. STOCK — Tous bâtiments — " + semaine, margin, y);
  y += 6;
  const stockBody: [string, string][] = [
    ["Effectif restant fin de semaine", formatVal(stock.effectifRestantFinSemaine)],
    ["Poids vif produit (kg)", formatVal(stock.poidsVifProduitKg)],
    ["Stock aliment", formatVal(stock.stockAliment)],
  ];
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
  y = lastY() + 8;

  doc.setFont("helvetica", "bold");
  doc.text("7. Contrôle des stocks — " + semaine, margin, y);
  y += 6;
  const controleBody: [string, string][] = [
    ["Quantité livrée", formatVal(controleStock.quantiteLivree)],
    ["QL-Stock", formatVal(controleStock.qlStock)],
    ["Écart", formatVal(controleStock.ecart)],
  ];
  autoTable(doc, {
    head: [["INDICATEUR", "VALEUR"]],
    body: controleBody,
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });

  doc.save(`Resume_Production_Hebdo_${safeFileName([farmName, `Lot${lot}`, semaine])}.pdf`);
}
