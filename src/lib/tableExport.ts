/**
 * Generic table export utilities — Excel and PDF.
 * DIP: Exporters depend on ITableExportConfig abstraction; pages provide concrete configs.
 * SOLID: Single responsibility (formatting), Open/Closed (extend via new configs).
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

/** Abstraction for table export data. Pages implement this to provide their specific data shape. */
export interface ITableExportConfig {
  /** Page title (e.g. "FICHE DE SUIVI DES LIVRAISONS D'ALIMENT") */
  title: string;
  /** Column headers */
  columns: string[];
  farmName: string;
  lot: string;
  semaine: string;
  /** Rows with at least id for age lookup */
  rows: { id: string }[];
  /** Transform row to array aligned with columns. age from ageByRowId. */
  rowToArray: (row: { id: string }, age: string | number) => (string | number)[];
  /** TOTAL row values, same length as columns. Omit when includeTotals is false. */
  weekTotalRow?: (string | number)[];
  /** CUMUL row values. Omit when includeTotals is false. */
  cumulRow?: (string | number)[];
  ageByRowId: Map<string, string | number>;
  /** Filename prefix (e.g. "Livraisons_Aliment") */
  fileNamePrefix: string;
  /** Column indices (0-based) for number format in Excel */
  numberFormatColumns?: number[];
  /** When false, do not add TOTAL/CUMUL rows (e.g. InfosSetup, Fournisseurs). Default true. */
  includeTotals?: boolean;
  /** Optional rows to prepend before main data (e.g. Vide sanitaire). Same column count. */
  prefixRows?: (string | number)[][];
  /** Optional rows to append after main data (e.g. Total Mâle/Femelle, Total Général). Same column count. */
  suffixRows?: (string | number)[][];
  /** Optional column widths for Excel (one per column). Default 14 when not specified. */
  columnWidths?: number[];
  /** When true, omit Lot and Semaine from the info block (e.g. Fournisseurs). */
  hideLotAndSemaine?: boolean;
  /** When true, omit only Semaine from the info block (e.g. InfosSetup). */
  hideSemaine?: boolean;
}

// Shared styling (ElevagePro: primary #3D2E1A, cream #F7F6F3, muted #E1E0DB)
const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const TOTAL_BG = "FFD8D6D0";
const BORDER_THIN = { style: "thin" as const };

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

/**
 * Export table data to Excel using ITableExportConfig.
 */
export async function exportTableToExcel(config: ITableExportConfig): Promise<void> {
  const { title, columns, farmName, lot, semaine, rows, rowToArray, weekTotalRow = [], cumulRow = [], ageByRowId, fileNamePrefix, numberFormatColumns = [], includeTotals = true, prefixRows = [], suffixRows = [], columnWidths, hideLotAndSemaine = false, hideSemaine = false } = config;

  const colCount = columns.length;
  const headerRow = hideLotAndSemaine ? 5 : hideSemaine ? 6 : 7;
  const dataStartRow = headerRow + 1;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const ws = workbook.addWorksheet("Export", {
    views: [{ state: "frozen", ySplit: headerRow, activeCell: `A${dataStartRow}`, showGridLines: true }],
  });

  // Column widths (use columnWidths when provided, else default 14)
  ws.columns = columns.map((_, i) => ({
    width: columnWidths?.[i] ?? 14,
  }));

  // Row 1: Title
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell("A1");
  titleCell.value = title;
  titleCell.font = { size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  titleCell.alignment = { horizontal: "center" };
  titleCell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
  ws.getRow(1).height = 28;

  ws.getRow(2).height = 6;

  // Info block
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
  ws.getRow(3).height = 20;
  let infoEndRow = 3;
  if (!hideLotAndSemaine) {
    ws.getCell("A4").value = "Lot";
    ws.getCell("B4").value = lot || "—";
    ws.getCell("A4").alignment = { horizontal: "right" };
    ["A4", "B4"].forEach((ref) => {
      ws.getCell(ref).font = infoStyle.font;
      ws.getCell(ref).fill = infoStyle.fill;
      ws.getCell(ref).border = infoStyle.border;
    });
    ws.getRow(4).height = 20;
    infoEndRow = 4;
    if (!hideSemaine) {
      ws.getCell("A5").value = "Semaine";
      ws.getCell("B5").value = semaine || "—";
      ws.getCell("A5").alignment = { horizontal: "right" };
      ["A5", "B5"].forEach((ref) => {
        ws.getCell(ref).font = infoStyle.font;
        ws.getCell(ref).fill = infoStyle.fill;
        ws.getCell(ref).border = infoStyle.border;
      });
      ws.getRow(5).height = 20;
      infoEndRow = 5;
    }
  }
  ws.getRow(infoEndRow + 1).height = 6;

  // Column headers (headerRow, dataStartRow computed above for hideLotAndSemaine)
  const headerStyle = {
    font: { size: 10, bold: true, color: { argb: HEADER_TEXT } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: HEADER_PRIMARY } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
    alignment: { horizontal: "center" as const, vertical: "middle" as const },
  };
  columns.forEach((col, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = col;
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.border = headerStyle.border;
    cell.alignment = headerStyle.alignment;
  });
  ws.getRow(headerRow).height = 22;

  // Prefix rows (e.g. Vide sanitaire) then data rows
  const VS_BG = "FFFDEDED"; // Light red tint for Vide sanitaire data
  let rowIndex = 0;
  for (let pi = 0; pi < prefixRows.length; pi++) {
    const prefixRow = prefixRows[pi];
    const r = dataStartRow + rowIndex;
    const isVsTotalOrCumul = prefixRows.length >= 2 && (pi === prefixRows.length - 2 || pi === prefixRows.length - 1);
    const fillColor = isVsTotalOrCumul ? TOTAL_BG : VS_BG;
    const prefixFont = isVsTotalOrCumul ? { size: 10, bold: true } : undefined;
    for (let c = 0; c < prefixRow.length; c++) {
      const cell = ws.getCell(r, c + 1);
      const val = prefixRow[c];
      cell.value = val;
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      if (prefixFont) cell.font = prefixFont;
      if (numberFormatColumns.includes(c)) {
        const num = typeof val === "number" ? val : parseFloat(String(val));
        if (!Number.isNaN(num)) {
          cell.value = num;
          cell.numFmt = "#,##0.00";
        }
      }
    }
    rowIndex++;
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const age = ageByRowId.get(row.id) ?? "—";
    const arr = rowToArray(row, age);
    const r = dataStartRow + rowIndex;
    for (let c = 0; c < arr.length; c++) {
      const cell = ws.getCell(r, c + 1);
      cell.value = arr[c];
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      if ((rowIndex - prefixRows.length) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
      if (numberFormatColumns.includes(c)) {
        const num = typeof arr[c] === "number" ? arr[c] : parseFloat(String(arr[c]));
        if (!Number.isNaN(num)) {
          cell.value = num;
          cell.numFmt = "#,##0.00";
        }
      }
    }
    rowIndex++;
  }

  // Suffix rows (e.g. Total Mâle/Femelle, Total Général)
  const totalStyle = {
    font: { size: 10, bold: true },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: TOTAL_BG } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
  };
  for (const suffixRow of suffixRows) {
    const r = dataStartRow + rowIndex;
    for (let c = 0; c < suffixRow.length; c++) {
      const cell = ws.getCell(r, c + 1);
      cell.value = suffixRow[c];
      cell.font = totalStyle.font;
      cell.fill = totalStyle.fill;
      cell.border = totalStyle.border;
      if (numberFormatColumns.includes(c)) {
        const num = typeof suffixRow[c] === "number" ? suffixRow[c] : parseFloat(String(suffixRow[c]));
        if (!Number.isNaN(num)) {
          cell.value = num;
          cell.numFmt = "#,##0.00";
        }
      }
    }
    rowIndex++;
  }

  const lastDataRow = dataStartRow + rowIndex - 1;
  let filterEndRow = lastDataRow;

  if (includeTotals && weekTotalRow.length > 0 && cumulRow.length > 0) {
    const totalRowNum = lastDataRow + 2;
    const cumulRowNum = totalRowNum + 1;
    filterEndRow = cumulRowNum;

    weekTotalRow.forEach((val, c) => {
      const cell = ws.getCell(totalRowNum, c + 1);
      cell.value = val;
      cell.font = totalStyle.font;
      cell.fill = totalStyle.fill;
      cell.border = totalStyle.border;
      if (numberFormatColumns.includes(c)) {
        cell.numFmt = "#,##0.00";
      }
    });

    cumulRow.forEach((val, c) => {
      const cell = ws.getCell(cumulRowNum, c + 1);
      cell.value = val;
      cell.font = totalStyle.font;
      cell.fill = totalStyle.fill;
      cell.border = totalStyle.border;
      if (numberFormatColumns.includes(c)) {
        cell.numFmt = "#,##0.00";
      }
    });
  }

  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: filterEndRow, column: colCount },
  };

  ws.views = [{ state: "frozen" as const, ySplit: 7, activeCell: "A8", showGridLines: true }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileNamePrefix}_${safeFileName([farmName, `Lot${lot}`, semaine])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export table data to PDF using ITableExportConfig.
 */
export function exportTableToPdf(config: ITableExportConfig): void {
  const { title, columns, farmName, lot, semaine, rows, rowToArray, weekTotalRow = [], cumulRow = [], ageByRowId, fileNamePrefix, includeTotals = true, prefixRows = [], suffixRows = [], hideLotAndSemaine = false, hideSemaine = false } = config;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 297;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 18, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const infoText = hideLotAndSemaine
    ? `Ferme: ${farmName || "—"}`
    : hideSemaine
      ? `Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}`
      : `Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Semaine: ${semaine || "—"}`;
  doc.text(infoText, margin, 24);

  const tableData: string[][] = [];
  for (const pr of prefixRows) {
    tableData.push(pr.map(String));
  }
  for (const row of rows) {
    const age = ageByRowId.get(row.id) ?? "—";
    tableData.push(rowToArray(row, age).map(String));
  }
  for (const sr of suffixRows) {
    tableData.push(sr.map(String));
  }
  if (includeTotals && weekTotalRow.length > 0) tableData.push(weekTotalRow.map(String));
  if (includeTotals && cumulRow.length > 0) tableData.push(cumulRow.map(String));

  doc.setTextColor(0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    head: [columns],
    body: tableData,
    startY: 30,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: {
      fillColor: [61, 46, 26],
      textColor: [247, 246, 243],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [232, 230, 225] },
    didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle?: string; fillColor?: number[]; textColor?: number[] } } }) => {
      if (data.section === "head") {
        data.cell.styles.fillColor = [61, 46, 26];
        data.cell.styles.textColor = [247, 246, 243];
        return;
      }
      if (data.section !== "body") return;
      const rowIndex = data.row.index;
      if (rowIndex < prefixRows.length) {
        const isVsTotalOrCumul =
          prefixRows.length >= 2 && (rowIndex === prefixRows.length - 2 || rowIndex === prefixRows.length - 1);
        if (isVsTotalOrCumul) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [216, 214, 208];
        } else {
          data.cell.styles.fillColor = [253, 237, 237];
        }
        return;
      }
      const dataRowCount = rows.length;
      const suffixStart = prefixRows.length + dataRowCount;
      const suffixEnd = suffixStart + suffixRows.length;
      if (rowIndex >= suffixStart && rowIndex < suffixEnd) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
        return;
      }
      if (!includeTotals || weekTotalRow.length === 0 || cumulRow.length === 0) return;
      const isTotal = rowIndex === tableData.length - 2;
      const isCumul = rowIndex === tableData.length - 1;
      if (isTotal || isCumul) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
      }
    },
  });

  doc.save(`${fileNamePrefix}_${safeFileName([farmName, `Lot${lot}`, semaine])}.pdf`);
}
