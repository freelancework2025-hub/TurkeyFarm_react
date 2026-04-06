/**
 * Export utilities for Produits Hygiène.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  PRODUITS_HYGIENE_TABLE_HEADERS,
  produitsHygieneResolvedMontant,
} from "@/lib/produitsHygieneShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

export interface HygieneRowExport {
  id: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
  male: string;
  femelle: string;
}

export interface HygieneExportTotals {
  qte: number;
  prix: number;
  montant: number;
  male: number;
  femelle: number;
}

/** Vide sanitaire: one export line per row (sem VS). */
export interface VideSanitaireHygiene {
  date: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
}

export interface ProduitsHygieneExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: HygieneRowExport[];
  weekTotal: HygieneExportTotals;
  cumul: HygieneExportTotals;
  ageByRowId: Map<string, string | number>;
  /** Vide sanitaire lines at top (multi-ligne). */
  videSanitaireRows?: VideSanitaireHygiene[];
  /** Vide sanitaire totals (qte, prix, montant). */
  videSanitaireTotal?: { qte: number; prix: number; montant: number };
  /** @deprecated Prefer videSanitaireRows */
  videSanitaire?: VideSanitaireHygiene;
}

const COLS = [...PRODUITS_HYGIENE_TABLE_HEADERS];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: HygieneRowExport, age: string | number): (string | number)[] {
  const qte = resolvedQteFromString(row.qte);
  const prix = toOptionalNumber(row.prixPerUnit);
  const montant = produitsHygieneResolvedMontant(row);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBR) || "—",
    qte == null ? "—" : qte,
    prix == null ? "—" : prix,
    montant == null ? "—" : montant,
  ];
}

function pdfRowMapper(cells: (string | number)[]): string[] {
  return cells.map((v, i) => {
    if (i === 0) return v === "—" ? "—" : String(v);
    if (i >= 7 && i <= 9) {
      if (v === "—") return "—";
      if (typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    }
    return String(v);
  });
}

function toConfig(params: ProduitsHygieneExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaireRows, videSanitaireTotal, videSanitaire } = params;
  const prefixRows: (string | number)[][] = [];
  const vsLines =
    videSanitaireRows && videSanitaireRows.length > 0
      ? videSanitaireRows
      : videSanitaire
        ? [videSanitaire]
        : [];
  
  // Add vide sanitaire data rows
  for (const vs of vsLines) {
    const qte = resolvedQteFromString(vs.qte);
    const prix = toOptionalNumber(vs.prixPerUnit);
    const montant = produitsHygieneResolvedMontant(vs);
    prefixRows.push([
      "—",
      safeStr(vs.date) || "—",
      "VS",
      "Vide sanitaire",
      safeStr(vs.supplier) || "—",
      safeStr(vs.deliveryNoteNumber) || "—",
      safeStr(vs.numeroBR) || "—",
      qte == null ? "—" : qte,
      prix == null ? "—" : prix,
      montant == null ? "—" : montant,
    ]);
  }
  
  // Add vide sanitaire total row if there are vide sanitaire entries
  if (vsLines.length > 0 && videSanitaireTotal) {
    prefixRows.push([
      "TOTAL vide sanitaire",
      "",
      "",
      "",
      "",
      "",
      "",
      videSanitaireTotal.qte ?? 0,
      videSanitaireTotal.prix ?? 0,
      videSanitaireTotal.montant ?? 0,
    ]);
  }
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS PRODUITS HYGIÈNE",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    prefixRows: prefixRows.length > 0 ? prefixRows : undefined,
    weekTotalRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      "",
      "",
      weekTotal.qte,
      weekTotal.prix,
      weekTotal.montant,
    ],
    cumulRow: ["CUMUL", "", "", "", "", "", "", cumul.qte, cumul.prix, cumul.montant],
    weekTotalPdfRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(weekTotal.qte, 2),
      formatGroupedNumber(weekTotal.prix, 2),
      formatGroupedNumber(weekTotal.montant, 2),
    ],
    cumulPdfRow: [
      "CUMUL",
      "",
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(cumul.qte, 2),
      formatGroupedNumber(cumul.prix, 2),
      formatGroupedNumber(cumul.montant, 2),
    ],
    pdfRowMapper,
    ageByRowId,
    fileNamePrefix: "Livraisons_Produits_Hygiene",
    numberFormatColumns: [7, 8, 9],
  };
}

/**
 * Export two tables for ProduitsHygiene: Vide Sanitaire + Main Livraisons in a single worksheet
 * With fixed headers for the currently visible section
 */
export async function exportToExcel(params: ProduitsHygieneExportParams): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaireRows = [], videSanitaireTotal } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  
  // Create single worksheet with both tables
  await createCombinedWorksheet(workbook, params);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Livraisons_Produits_Hygiene_${farmName.replace(/\s+/g, "_")}_Lot${lot}_${semaine}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Create combined worksheet with both Vide Sanitaire and Main Livraisons tables
 * Uses frozen panes at the main table headers for optimal viewing
 */
async function createCombinedWorksheet(workbook: ExcelJS.Workbook, params: ProduitsHygieneExportParams): Promise<void> {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaireRows = [], videSanitaireTotal } = params;
  
  const hasVideSanitaire = videSanitaireRows.length > 0;
  
  // Calculate freeze position - freeze at main table headers for best user experience
  let mainTableHeaderRow = 7; // Default when no vide sanitaire
  if (hasVideSanitaire) {
    // VS section: title(1) + headers(1) + data rows + total(1) + spacing(2) = 5 + data rows
    mainTableHeaderRow = 7 + videSanitaireRows.length + (videSanitaireTotal ? 1 : 0) + 2;
  }
  
  const ws = workbook.addWorksheet("Produits Hygiène", { 
    views: [{ 
      state: "frozen", 
      ySplit: mainTableHeaderRow, // Freeze at main table headers
      activeCell: `A${mainTableHeaderRow + 1}`, 
      showGridLines: true 
    }] 
  });

  const HEADER_PRIMARY = "FF3D2E1A";
  const HEADER_TEXT = "FFF7F6F3";
  const TOTAL_BG = "FFD8D6D0";
  const VS_BG = "FFFDEDED";
  const ROW_ALT = "FFE8E6E1";
  const BORDER_THIN = { style: "thin" as const };

  // Column setup
  ws.columns = COLS.map((_, i) => ({ width: 14 }));

  // Row 1: Title
  ws.mergeCells(1, 1, 1, COLS.length);
  const titleCell = ws.getCell("A1");
  titleCell.value = "FICHE DE SUIVI DES LIVRAISONS PRODUITS HYGIÈNE";
  titleCell.font = { size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  titleCell.alignment = { horizontal: "center" };
  titleCell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 6;

  // Info block (Ferme, Lot, Semaine)
  const infoStyle = { font: { size: 11, bold: true }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE1E0DB" } }, border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN } };
  ws.getCell("A3").value = "Ferme";
  ws.getCell("B3").value = farmName;
  ws.getCell("A4").value = "Lot";
  ws.getCell("B4").value = lot;
  ws.getCell("A5").value = "Semaine";
  ws.getCell("B5").value = semaine;
  ["A3", "B3", "A4", "B4", "A5", "B5"].forEach((ref) => {
    const cell = ws.getCell(ref);
    cell.font = infoStyle.font;
    cell.fill = infoStyle.fill;
    cell.border = infoStyle.border;
  });
  ws.getCell("A3").alignment = { horizontal: "right" };
  ws.getCell("A4").alignment = { horizontal: "right" };
  ws.getCell("A5").alignment = { horizontal: "right" };
  [3, 4, 5].forEach((r) => ws.getRow(r).height = 20);
  ws.getRow(6).height = 6;

  const headerStyle = { font: { size: 10, bold: true, color: { argb: HEADER_TEXT } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: HEADER_PRIMARY } }, border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN }, alignment: { horizontal: "center" as const, vertical: "middle" as const } };

  let currentRowNum = 7;

  // **TABLE 1: VIDE SANITAIRE** (if exists)
  if (hasVideSanitaire) {
    // Section title
    ws.mergeCells(currentRowNum, 1, currentRowNum, COLS.length);
    const vsHeader = ws.getCell(currentRowNum, 1);
    vsHeader.value = "VIDE SANITAIRE";
    vsHeader.font = { size: 12, bold: true, color: { argb: HEADER_TEXT } };
    vsHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    vsHeader.alignment = { horizontal: "left" };
    ws.getRow(currentRowNum).height = 24;
    currentRowNum++;

    // VS Column headers
    COLS.forEach((col, i) => {
      const cell = ws.getCell(currentRowNum, i + 1);
      cell.value = col;
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.border = headerStyle.border;
      cell.alignment = headerStyle.alignment;
    });
    ws.getRow(currentRowNum).height = 22;
    currentRowNum++;

    // Vide sanitaire rows
    for (const vs of videSanitaireRows) {
      const qte = resolvedQteFromString(vs.qte);
      const prix = toOptionalNumber(vs.prixPerUnit);
      const montant = produitsHygieneResolvedMontant(vs);
      const rowData = [
        "—",
        safeStr(vs.date),
        "VS",
        "Vide sanitaire",
        safeStr(vs.supplier),
        safeStr(vs.deliveryNoteNumber),
        safeStr(vs.numeroBR),
        qte,
        prix,
        montant,
      ];
      rowData.forEach((val, c) => {
        const cell = ws.getCell(currentRowNum, c + 1);
        cell.value = val;
        cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VS_BG } };
        if ([7, 8, 9].includes(c) && typeof val === "number") {
          cell.numFmt = "#,##0.00";
        }
      });
      currentRowNum++;
    }

    // Vide sanitaire total row
    if (videSanitaireTotal) {
      const vsData = ["TOTAL vide sanitaire", "", "", "", "", "", "", videSanitaireTotal.qte, videSanitaireTotal.prix, videSanitaireTotal.montant];
      vsData.forEach((val, c) => {
        const cell = ws.getCell(currentRowNum, c + 1);
        cell.value = val;
        cell.font = { size: 10, bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
        cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
        if ([7, 8, 9].includes(c) && typeof val === "number") {
          cell.numFmt = "#,##0.00";
        }
      });
      currentRowNum++;
    }

    // Spacing between tables
    currentRowNum += 2;
  }

  // **TABLE 2: LIVRAISONS PRODUITS HYGIÈNE**
  // Section title
  ws.mergeCells(currentRowNum, 1, currentRowNum, COLS.length);
  const mainHeader = ws.getCell(currentRowNum, 1);
  mainHeader.value = hasVideSanitaire ? "LIVRAISONS PRODUITS HYGIÈNE" : "PRODUITS HYGIÈNE";
  mainHeader.font = { size: 12, bold: true, color: { argb: HEADER_TEXT } };
  mainHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  mainHeader.alignment = { horizontal: "left" };
  ws.getRow(currentRowNum).height = 24;
  currentRowNum++;

  // Main table column headers (this is where we freeze)
  COLS.forEach((col, i) => {
    const cell = ws.getCell(currentRowNum, i + 1);
    cell.value = col;
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.border = headerStyle.border;
    cell.alignment = headerStyle.alignment;
  });
  ws.getRow(currentRowNum).height = 22;
  currentRowNum++;

  // Main livraisons rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const age = ageByRowId.get(row.id) ?? "—";
    const arr = rowToArray(row, age);
    arr.forEach((val, c) => {
      const cell = ws.getCell(currentRowNum, c + 1);
      cell.value = val;
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      if (i % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
      if ([7, 8, 9].includes(c) && typeof val === "number") {
        cell.numFmt = "#,##0.00";
      }
    });
    currentRowNum++;
  }

  // TOTAL semaine row
  const totalData = [`TOTAL ${semaine}`, "", "", "", "", "", "", weekTotal.qte, weekTotal.prix, weekTotal.montant];
  totalData.forEach((val, c) => {
    const cell = ws.getCell(currentRowNum, c + 1);
    cell.value = val;
    cell.font = { size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
    if ([7, 8, 9].includes(c) && typeof val === "number") {
      cell.numFmt = "#,##0.00";
    }
  });
  currentRowNum++;

  // CUMUL row
  const cumulData = ["CUMUL", "", "", "", "", "", "", cumul.qte, cumul.prix, cumul.montant];
  cumulData.forEach((val, c) => {
    const cell = ws.getCell(currentRowNum, c + 1);
    cell.value = val;
    cell.font = { size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
    if ([7, 8, 9].includes(c) && typeof val === "number") {
      cell.numFmt = "#,##0.00";
    }
  });
}

export function exportToPdf(params: ProduitsHygieneExportParams): void {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaireRows = [], videSanitaireTotal } = params;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 297;

  // **TITLE & INFO BLOCK**
  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("FICHE DE SUIVI DES LIVRAISONS PRODUITS HYGIÈNE", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 18, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const infoText = `Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Semaine: ${semaine || "—"}`;
  doc.text(infoText, margin, 24);

  let currentY = 30;

  // **TABLE 1: VIDE SANITAIRE**
  if (videSanitaireRows.length > 0) {
    const vsTableData: string[][] = [];
    for (const vs of videSanitaireRows) {
      const qte = resolvedQteFromString(vs.qte);
      const prix = toOptionalNumber(vs.prixPerUnit);
      const montant = produitsHygieneResolvedMontant(vs);
      vsTableData.push([
        "—",
        safeStr(vs.date),
        "VS",
        "Vide sanitaire",
        safeStr(vs.supplier),
        safeStr(vs.deliveryNoteNumber),
        safeStr(vs.numeroBR),
        qte == null ? "—" : formatGroupedNumber(qte, 2),
        prix == null ? "—" : formatGroupedNumber(prix, 2),
        montant == null ? "—" : formatGroupedNumber(montant, 2),
      ]);
    }

    if (videSanitaireTotal) {
      vsTableData.push([
        "TOTAL vide sanitaire",
        "",
        "",
        "",
        "",
        "",
        "",
        formatGroupedNumber(videSanitaireTotal.qte, 2),
        formatGroupedNumber(videSanitaireTotal.prix, 2),
        formatGroupedNumber(videSanitaireTotal.montant, 2),
      ]);
    }

    // Add section header
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("VIDE SANITAIRE", margin, currentY);
    currentY += 6;

    (doc as any).autoTable({
      head: [COLS],
      body: vsTableData,
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: {
        fillColor: [61, 46, 26],
        textColor: [247, 246, 243],
        fontStyle: "bold",
      },
      bodyStyles: { fillColor: [253, 237, 237] },
      alternateRowStyles: { fillColor: [253, 237, 237] },
      didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle?: string; fillColor?: number[] } } }) => {
        if (data.section === "body" && videSanitaireTotal && data.row.index === vsTableData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [216, 214, 208];
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // **TABLE 2: LIVRAISONS PRODUITS HYGIÈNE**
  const mainTableData: string[][] = [];
  for (const row of rows) {
    const age = ageByRowId.get(row.id) ?? "—";
    const cells = rowToArray(row, age);
    mainTableData.push(pdfRowMapper(cells));
  }

  // Add TOTAL and CUMUL rows
  mainTableData.push([
    `TOTAL ${semaine}`,
    "",
    "",
    "",
    "",
    "",
    "",
    formatGroupedNumber(weekTotal.qte, 2),
    formatGroupedNumber(weekTotal.prix, 2),
    formatGroupedNumber(weekTotal.montant, 2),
  ]);

  mainTableData.push([
    "CUMUL",
    "",
    "",
    "",
    "",
    "",
    "",
    formatGroupedNumber(cumul.qte, 2),
    formatGroupedNumber(cumul.prix, 2),
    formatGroupedNumber(cumul.montant, 2),
  ]);

  // Add section header
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("LIVRAISONS PRODUITS HYGIÈNE", margin, currentY);
  currentY += 6;

  (doc as any).autoTable({
    head: [COLS],
    body: mainTableData,
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: {
      fillColor: [61, 46, 26],
      textColor: [247, 246, 243],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [232, 230, 225] },
    didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle?: string; fillColor?: number[] } } }) => {
      if (data.section === "body") {
        const isLastTwoRows = data.row.index >= mainTableData.length - 2;
        if (isLastTwoRows) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [216, 214, 208];
        }
      }
    },
  });

  doc.save(`Livraisons_Produits_Hygiene_${farmName.replace(/\s+/g, "_")}_Lot${lot}_${semaine}.pdf`);
}

