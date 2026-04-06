/**
 * Export utilities for Résumé des coûts hebdomadaires (Prix de revient).
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { ResumeCoutsHebdoSummaryResponse } from "@/lib/api";
import { formatResumeAmount as formatNum } from "@/lib/formatResumeAmount";
import { buildDisplayRows, getEffectiveCumul, toNum } from "@/lib/resumeCoutsHebdoDisplay";
import {
  getResumeCoutsPrixRevientHeaders,
  RESUME_COUTS_PRIX_REVIENT_COLUMN_COUNT,
  RESUME_COUTS_FOOTER_TOTAL_LABEL,
  RESUME_COUTS_INDICATEUR_TABLE_HEADERS,
  formatResumeCoutsPct,
} from "@/lib/resumeCoutsHebdoShared";

export interface ResumeCoutsHebdoExportParams {
  farmName: string;
  farmId: number;
  lot: string;
  semaine: string;
  batiments: string[];
  summary: ResumeCoutsHebdoSummaryResponse;
}

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const TOTAL_BG = "FFD8D6D0";
const BORDER_THIN = { style: "thin" as const };
const BORDERS_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

export async function exportToExcel(params: ResumeCoutsHebdoExportParams): Promise<void> {
  const { farmName, lot, semaine, batiments, summary } = params;
  const { costLines, computedRows, poidsVifProduitKg, effectifRestantFinSemaine, totalNbreProduction, prixRevientParSujet, prixRevientParKg } = summary;

  const displayRows = buildDisplayRows(costLines, computedRows ?? [], semaine, params.farmId, params.lot);
  const totalCumul = displayRows.reduce((s, r) => s + (getEffectiveCumul(r) ?? 0), 0);
  const totalS1 = displayRows.reduce((s, r) => s + (toNum(r.valeurS1) ?? 0), 0);
  const totalCumulDhKg = poidsVifProduitKg != null && poidsVifProduitKg > 0 ? totalCumul / poidsVifProduitKg : null;
  const prixSujet = prixRevientParSujet != null ? prixRevientParSujet : totalCumul > 0 && effectifRestantFinSemaine != null && totalNbreProduction != null && effectifRestantFinSemaine + totalNbreProduction > 0 ? totalCumul / (effectifRestantFinSemaine + totalNbreProduction) : null;
  const prixKg = prixRevientParKg ?? totalCumulDhKg;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  let currentRow = 1;

  const addTitle = (ws: ExcelJS.Worksheet, text: string) => {
    ws.mergeCells(currentRow, 1, currentRow, RESUME_COUTS_PRIX_REVIENT_COLUMN_COUNT);
    const cell = ws.getCell(currentRow, 1);
    cell.value = text;
    cell.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
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

  const ws = workbook.addWorksheet("Résumé coûts", { views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true }] });
  ws.columns = [
    { width: 28 },  // DESIGNATION
    { width: 16 },  // S1 / semaine
    { width: 16 },  // CUMUL
    { width: 16 },  // CUMUL DH/KG
    { width: 14 },  // %
  ];

  addTitle(ws, "RÉSUMÉ DES COÛTS HEBDOMADAIRES — PRIX DE REVIENT");
  addInfoBlock(ws, [
    ["Ferme", farmName || "—"],
    ["Lot", lot || "—"],
    ["Semaine", semaine || "—"],
    ["Bâtiments", batiments.join(", ") || "—"],
  ]);

  // Section 1. Prix de revient — Tous bâtiments — {semaine}
  addTitle(ws, `1. Prix de revient — Tous bâtiments — ${semaine}`);
  const costHeaders = getResumeCoutsPrixRevientHeaders(semaine);
  for (let c = 0; c < costHeaders.length; c++) {
    const cell = ws.getCell(currentRow, c + 1);
    cell.value = costHeaders[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow++;
  let dataIdx = 0;
  for (const r of displayRows) {
    const effectiveCumul = getEffectiveCumul(r);
    const cumulDhKg = poidsVifProduitKg != null && poidsVifProduitKg > 0 && effectiveCumul != null ? effectiveCumul / poidsVifProduitKg : null;
    const pct = totalCumul > 0 && effectiveCumul != null ? (effectiveCumul / totalCumul) * 100 : null;
    ws.getCell(currentRow, 1).value = r.designation ?? "—";
    ws.getCell(currentRow, 2).value = toNum(r.valeurS1) ?? "—";
    ws.getCell(currentRow, 3).value = effectiveCumul ?? "—";
    ws.getCell(currentRow, 4).value = cumulDhKg ?? "—";
    ws.getCell(currentRow, 5).value = pct != null ? formatResumeCoutsPct(pct) : "—";
    for (let c = 1; c <= 5; c++) {
      ws.getCell(currentRow, c).border = BORDERS_ALL;
      if (dataIdx % 2 === 1) ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      if (c >= 2 && c <= 4) {
        const val = ws.getCell(currentRow, c).value;
        if (typeof val === "number") ws.getCell(currentRow, c).numFmt = "# ##0.00";
      }
    }
    currentRow++;
    dataIdx++;
  }
  // TOTAL row
  ws.getCell(currentRow, 1).value = RESUME_COUTS_FOOTER_TOTAL_LABEL;
  ws.getCell(currentRow, 2).value = totalS1;
  ws.getCell(currentRow, 3).value = totalCumul;
  ws.getCell(currentRow, 4).value = totalCumulDhKg ?? "—";
  ws.getCell(currentRow, 5).value = totalCumul > 0 ? formatResumeCoutsPct(100) : "—";
  for (let c = 1; c <= 5; c++) {
    const cell = ws.getCell(currentRow, c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    cell.border = BORDERS_ALL;
    if (c >= 2 && c <= 4 && typeof cell.value === "number") cell.numFmt = "# ##0.00";
  }
  currentRow += 2;

  // Section 2. Prix de revient/sujet et /kg
  addTitle(ws, "2. Prix de revient/sujet et /kg");
  addInfoBlock(ws, [
    ["PRIX DE REVIENT/SUJET", formatNum(prixSujet)],
    ["PRIX DE REVIENT/KG", formatNum(prixKg)],
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Resume_Couts_Hebdo_${safeFileName([farmName, `Lot${lot}`, semaine])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: ResumeCoutsHebdoExportParams): void {
  const { farmName, lot, semaine, batiments, summary } = params;
  const { costLines, computedRows, poidsVifProduitKg, effectifRestantFinSemaine, totalNbreProduction, prixRevientParSujet, prixRevientParKg } = summary;

  const displayRows = buildDisplayRows(costLines, computedRows ?? [], semaine, params.farmId, params.lot);
  const totalCumul = displayRows.reduce((s, r) => s + (getEffectiveCumul(r) ?? 0), 0);
  const totalS1 = displayRows.reduce((s, r) => s + (toNum(r.valeurS1) ?? 0), 0);
  const totalCumulDhKg = poidsVifProduitKg != null && poidsVifProduitKg > 0 ? totalCumul / poidsVifProduitKg : null;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 297;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RÉSUMÉ DES COÛTS HEBDOMADAIRES — PRIX DE REVIENT", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 18, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Semaine: ${semaine || "—"}  |  Bâtiments: ${batiments.join(", ") || "—"}`, margin, 24);

  doc.setTextColor(0, 0, 0);
  let startY = 32;

  const headerCols = getResumeCoutsPrixRevientHeaders(semaine);
  const body: string[][] = displayRows.map((r) => {
    const effectiveCumul = getEffectiveCumul(r);
    const cumulDhKg = poidsVifProduitKg != null && poidsVifProduitKg > 0 && effectiveCumul != null ? effectiveCumul / poidsVifProduitKg : null;
    const pct = totalCumul > 0 && effectiveCumul != null ? (effectiveCumul / totalCumul) * 100 : null;
    return [
      r.designation ?? "—",
      formatNum(toNum(r.valeurS1)),
      formatNum(effectiveCumul),
      formatNum(cumulDhKg),
      pct != null ? formatResumeCoutsPct(pct) : "—",
    ];
  });
  body.push([
    RESUME_COUTS_FOOTER_TOTAL_LABEL,
    formatNum(totalS1),
    formatNum(totalCumul),
    formatNum(totalCumulDhKg),
    totalCumul > 0 ? formatResumeCoutsPct(100) : "—",
  ]);

  (doc as unknown as { autoTable: (opts: object) => void }).autoTable({
    head: [headerCols],
    body,
    startY,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    didParseCell: (data: { section: string; row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
      if (data.section === "head") {
        data.cell.styles.fillColor = [61, 46, 26];
        (data.cell.styles as { textColor?: number[] }).textColor = [247, 246, 243];
        return;
      }
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
      } else if (data.row.index % 2 === 1) {
        data.cell.styles.fillColor = [232, 230, 225];
      }
    },
  });

  startY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY + 20;
  startY += 8;

  if (effectifRestantFinSemaine != null || totalNbreProduction != null) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PRIX DE REVIENT/SUJET et PRIX DE REVIENT/KG", margin, startY);
    startY += 6;
    const prixSujet = prixRevientParSujet != null ? prixRevientParSujet : totalCumul > 0 && effectifRestantFinSemaine != null && totalNbreProduction != null && effectifRestantFinSemaine + totalNbreProduction > 0 ? totalCumul / (effectifRestantFinSemaine + totalNbreProduction) : null;
    const prixKg = prixRevientParKg ?? totalCumulDhKg;
    (doc as unknown as { autoTable: (opts: object) => void }).autoTable({
      head: [[...RESUME_COUTS_INDICATEUR_TABLE_HEADERS]],
      body: [
        ["PRIX DE REVIENT/SUJET", formatNum(prixSujet)],
        ["PRIX DE REVIENT/KG", formatNum(prixKg)],
      ],
      startY,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    });
  }

  doc.save(`Resume_Couts_Hebdo_${safeFileName([farmName, `Lot${lot}`, semaine])}.pdf`);
}
