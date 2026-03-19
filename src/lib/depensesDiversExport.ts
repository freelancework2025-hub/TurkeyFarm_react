/**
 * Export utilities for Dépenses Divers.
 * Dual-table export: Table 1 (Vide sanitaire) with its own attributes,
 * Table 2 (Dépenses divers) with its own attributes.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

export interface DepenseDiversRowExport {
  id: string;
  date: string;
  age: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  ug: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
}

/** Vide sanitaire row — Table 1 attributes. */
export interface VideSanitaireDepenseDiversRow {
  date: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  ug: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
}

export interface DepensesDiversExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: DepenseDiversRowExport[];
  weekTotalQte: number;
  weekTotalMontant: number;
  cumulQte: number;
  cumulMontant: number;
  ageByRowId: Map<string, string | number>;
  videSanitaireRows: VideSanitaireDepenseDiversRow[];
  videSanitaireTotalQte: number;
  videSanitaireTotalMontant: number;
}

// Table 1: Vide sanitaire — 9 columns (page attributes)
const VS_COLS = ["DATE", "DÉSIGNATION", "FOURNISSEUR", "N° BL", "N° BR", "UG", "QUANTITÉ", "PRIX", "MONTANT"];

// Table 2: Dépenses divers — 10 columns (page attributes)
const MAIN_COLS = ["AGE", "DATE", "SEM", "DÉSIGNATION", "FOURNISSEUR", "N° BL", "N° BR", "QTE", "PRIX", "MONTANT"];

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const TOTAL_BG = "FFD8D6D0";
const VS_ROW_BG = "FFFDEDED";
const BORDER_THIN = { style: "thin" as const };

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

function vsRowToArray(r: VideSanitaireDepenseDiversRow): (string | number)[] {
  const qte = parseFloat(String(r.qte).replace(",", "."));
  const prix = parseFloat(String(r.prixPerUnit).replace(",", "."));
  const montant =
    (r.montant ?? "").trim() !== ""
      ? parseFloat(String(r.montant).replace(",", "."))
      : (!Number.isNaN(qte) && !Number.isNaN(prix) ? qte * prix : 0);
  return [
    safeStr(r.date) || "—",
    safeStr(r.designation) || "—",
    safeStr(r.supplier) || "—",
    safeStr(r.deliveryNoteNumber) || "—",
    safeStr(r.numeroBR) || "—",
    safeStr(r.ug) || "—",
    Number.isNaN(qte) ? "—" : qte,
    Number.isNaN(prix) ? "—" : prix,
    Number.isNaN(montant) ? "—" : montant,
  ];
}

function mainRowToArray(row: DepenseDiversRowExport, age: string | number): (string | number)[] {
  const qte = parseFloat(String(row.qte).replace(",", "."));
  const prix = parseFloat(String(row.prixPerUnit).replace(",", "."));
  const montant =
    (row.montant ?? "").trim() !== ""
      ? parseFloat(String(row.montant).replace(",", "."))
      : (!Number.isNaN(qte) && !Number.isNaN(prix) ? qte * prix : 0);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.age) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBR) || "—",
    Number.isNaN(qte) ? "—" : qte,
    Number.isNaN(prix) ? "—" : prix,
    Number.isNaN(montant) ? "—" : montant,
  ];
}

export async function exportToExcel(params: DepensesDiversExportParams): Promise<void> {
  const {
    farmName,
    lot,
    semaine,
    rows,
    weekTotalQte,
    weekTotalMontant,
    cumulQte,
    cumulMontant,
    ageByRowId,
    videSanitaireRows,
    videSanitaireTotalQte,
    videSanitaireTotalMontant,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const ws = workbook.addWorksheet("Export", { views: [{ state: "frozen", ySplit: 7, activeCell: "A8", showGridLines: true }] });

  const maxCols = Math.max(VS_COLS.length, MAIN_COLS.length);
  ws.columns = Array.from({ length: maxCols }, () => ({ width: 14 }));

  // Row 1: Title
  ws.mergeCells(1, 1, 1, maxCols);
  const titleCell = ws.getCell("A1");
  titleCell.value = "DÉPENSES DIVERS";
  titleCell.font = { size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  titleCell.alignment = { horizontal: "center" };
  titleCell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 6;

  const infoStyle = {
    font: { size: 11, bold: true },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE1E0DB" } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
  };
  ws.getCell("A3").value = "Ferme";
  ws.getCell("B3").value = farmName || "—";
  ws.getCell("A3").alignment = { horizontal: "right" };
  ["A3", "B3"].forEach((ref) => {
    ws.getCell(ref).font = infoStyle.font;
    ws.getCell(ref).fill = infoStyle.fill;
    ws.getCell(ref).border = infoStyle.border;
  });
  ws.getCell("A4").value = "Lot";
  ws.getCell("B4").value = lot || "—";
  ws.getCell("A4").alignment = { horizontal: "right" };
  ["A4", "B4"].forEach((ref) => {
    ws.getCell(ref).font = infoStyle.font;
    ws.getCell(ref).fill = infoStyle.fill;
    ws.getCell(ref).border = infoStyle.border;
  });
  ws.getCell("A5").value = "Semaine";
  ws.getCell("B5").value = semaine || "—";
  ws.getCell("A5").alignment = { horizontal: "right" };
  ["A5", "B5"].forEach((ref) => {
    ws.getCell(ref).font = infoStyle.font;
    ws.getCell(ref).fill = infoStyle.fill;
    ws.getCell(ref).border = infoStyle.border;
  });
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 20;
  ws.getRow(5).height = 20;
  ws.getRow(6).height = 6;

  let dataRow = 8;

  // ---------- TABLE 1: Vide sanitaire ----------
  ws.mergeCells(dataRow, 1, dataRow, VS_COLS.length);
  const vsTitleCell = ws.getCell(dataRow, 1);
  vsTitleCell.value = "Vide sanitaire";
  vsTitleCell.font = { size: 12, bold: true };
  vsTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
  dataRow++;

  // Table 1 headers
  const headerStyle = {
    font: { size: 10, bold: true, color: { argb: HEADER_TEXT } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: HEADER_PRIMARY } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
    alignment: { horizontal: "center" as const, vertical: "middle" as const },
  };
  VS_COLS.forEach((col, i) => {
    const cell = ws.getCell(dataRow, i + 1);
    cell.value = col;
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.border = headerStyle.border;
    cell.alignment = headerStyle.alignment;
  });
  dataRow++;

  // Table 1 data rows
  const vsNumCols = [6, 7, 8]; // QUANTITÉ, PRIX, MONTANT (0-based)
  for (const r of videSanitaireRows) {
    const arr = vsRowToArray(r);
    for (let c = 0; c < arr.length; c++) {
      const cell = ws.getCell(dataRow, c + 1);
      cell.value = arr[c];
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VS_ROW_BG } };
      if (vsNumCols.includes(c)) {
        const num = typeof arr[c] === "number" ? arr[c] : parseFloat(String(arr[c]));
        if (!Number.isNaN(num)) {
          cell.value = num;
          cell.numFmt = "#,##0.00";
        }
      }
    }
    dataRow++;
  }

  // Table 1 TOTAL and CUMUL
  if (videSanitaireRows.length > 0) {
    const totalStyle = {
      font: { size: 10, bold: true },
      fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: TOTAL_BG } },
      border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
    };
    const totalRow = ["TOTAL", "", "", "", "", "", videSanitaireTotalQte, "", videSanitaireTotalMontant];
    const cumulRow = ["CUMUL", "", "", "", "", "", videSanitaireTotalQte, "", videSanitaireTotalMontant];
    for (let r = 0; r < 2; r++) {
      const arr = r === 0 ? totalRow : cumulRow;
      for (let c = 0; c < arr.length; c++) {
        const cell = ws.getCell(dataRow, c + 1);
        cell.value = arr[c];
        cell.font = totalStyle.font;
        cell.fill = totalStyle.fill;
        cell.border = totalStyle.border;
        if (c === 6 || c === 8) cell.numFmt = "#,##0.00";
      }
      dataRow++;
    }
  }

  dataRow += 2; // Gap between tables

  // ---------- TABLE 2: Dépenses divers ----------
  ws.mergeCells(dataRow, 1, dataRow, MAIN_COLS.length);
  const mainTitleCell = ws.getCell(dataRow, 1);
  mainTitleCell.value = "Dépenses divers";
  mainTitleCell.font = { size: 12, bold: true };
  mainTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
  dataRow++;

  // Table 2 headers
  MAIN_COLS.forEach((col, i) => {
    const cell = ws.getCell(dataRow, i + 1);
    cell.value = col;
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.border = headerStyle.border;
    cell.alignment = headerStyle.alignment;
  });
  dataRow++;

  const mainNumCols = [7, 8, 9]; // QTE, PRIX, MONTANT (0-based)
  const mainStartRow = dataRow;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const age = ageByRowId.get(row.id) ?? "—";
    const arr = mainRowToArray(row, age);
    for (let c = 0; c < arr.length; c++) {
      const cell = ws.getCell(dataRow, c + 1);
      cell.value = arr[c];
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      if ((dataRow - mainStartRow) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
      if (mainNumCols.includes(c)) {
        const num = typeof arr[c] === "number" ? arr[c] : parseFloat(String(arr[c]));
        if (!Number.isNaN(num)) {
          cell.value = num;
          cell.numFmt = "#,##0.00";
        }
      }
    }
    dataRow++;
  }

  // Table 2 TOTAL and CUMUL
  const mainTotalStyle = {
    font: { size: 10, bold: true },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: TOTAL_BG } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
  };
  const mainTotalRow = [`TOTAL ${semaine}`, "", "", "", "", "", "", weekTotalQte, "", weekTotalMontant];
  const mainCumulRow = ["CUMUL (Vide sanitaire + semaines)", "", "", "", "", "", "", cumulQte, "", cumulMontant];
  for (let r = 0; r < 2; r++) {
    const arr = r === 0 ? mainTotalRow : mainCumulRow;
    for (let c = 0; c < arr.length; c++) {
      const cell = ws.getCell(dataRow, c + 1);
      cell.value = arr[c];
      cell.font = mainTotalStyle.font;
      cell.fill = mainTotalStyle.fill;
      cell.border = mainTotalStyle.border;
      if (c === 7 || c === 9) cell.numFmt = "#,##0.00";
    }
    dataRow++;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Depenses_Divers_${safeFileName([farmName, `Lot${lot}`, semaine])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: DepensesDiversExportParams): void {
  const {
    farmName,
    lot,
    semaine,
    rows,
    weekTotalQte,
    weekTotalMontant,
    cumulQte,
    cumulMontant,
    ageByRowId,
    videSanitaireRows,
    videSanitaireTotalQte,
    videSanitaireTotalMontant,
  } = params;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 297;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("DÉPENSES DIVERS", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 18, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Semaine: ${semaine || "—"}`, margin, 24);

  doc.setTextColor(0, 0, 0);
  let startY = 32;

  // ---------- TABLE 1: Vide sanitaire ----------
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Vide sanitaire", margin, startY);
  startY += 6;

  const vsTableData: string[][] = videSanitaireRows.map((r) => vsRowToArray(r).map(String));
  if (videSanitaireRows.length > 0) {
    vsTableData.push(["TOTAL", "", "", "", "", "", String(videSanitaireTotalQte), "", String(videSanitaireTotalMontant)]);
    vsTableData.push(["CUMUL", "", "", "", "", "", String(videSanitaireTotalQte), "", String(videSanitaireTotalMontant)]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    head: [VS_COLS],
    body: vsTableData,
    startY,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle?: string; fillColor?: number[]; textColor?: number[] } } }) => {
      if (data.section === "head") {
        data.cell.styles.fillColor = [61, 46, 26];
        data.cell.styles.textColor = [247, 246, 243];
        return;
      }
      const rowIndex = data.row.index;
      const isTotal = rowIndex === vsTableData.length - 2;
      const isCumul = rowIndex === vsTableData.length - 1;
      if (isTotal || isCumul) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
      } else {
        data.cell.styles.fillColor = [253, 237, 237];
      }
    },
  });

  const vsEndY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
  startY = vsEndY + 12;

  // ---------- TABLE 2: Dépenses divers ----------
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Dépenses divers", margin, startY);
  startY += 6;

  const mainTableData: string[][] = rows.map((r) => mainRowToArray(r, ageByRowId.get(r.id) ?? "—").map(String));
  mainTableData.push([`TOTAL ${semaine}`, "", "", "", "", "", "", String(weekTotalQte), "", String(weekTotalMontant)]);
  mainTableData.push(["CUMUL (Vide sanitaire + semaines)", "", "", "", "", "", "", String(cumulQte), "", String(cumulMontant)]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    head: [MAIN_COLS],
    body: mainTableData,
    startY,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
    didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle?: string; fillColor?: number[]; textColor?: number[] } } }) => {
      if (data.section === "head") {
        data.cell.styles.fillColor = [61, 46, 26];
        data.cell.styles.textColor = [247, 246, 243];
        return;
      }
      const rowIndex = data.row.index;
      const isTotal = rowIndex === mainTableData.length - 2;
      const isCumul = rowIndex === mainTableData.length - 1;
      if (isTotal || isCumul) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
      }
    },
  });

  doc.save(`Depenses_Divers_${safeFileName([farmName, `Lot${lot}`, semaine])}.pdf`);
}
