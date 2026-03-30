/**
 * Export utilities for Reporting Journalier.
 * Dual-table export: Table 1 (Effectif Mis en Place), Table 2 (Reporting Journalier).
 * Fetches data via API when called; both tables are included in Excel and PDF.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { api, type SetupInfoResponse, type DailyReportResponse } from "@/lib/api";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";
import {
  REPORTING_DAILY_TABLE_HEADERS,
  REPORTING_EFFECTIF_TABLE_HEADERS,
  reportingDailyExportRowToArray,
  reportingEffectifExportRowToArray,
  reportingGetEffectivePlacement,
  reportingGetFirstDayFromSetup,
} from "@/lib/reportingJournalierShared";

export interface ReportingJournalierExportParams {
  farmName: string;
  lot: string;
  farmId?: number | null;
  /** When set (viewing a specific day), export includes cumulative reports from day 1 through that day. */
  selectedDate?: string | null;
}

const EFFECTIF_COLS = [...REPORTING_EFFECTIF_TABLE_HEADERS];
const DAILY_COLS = [...REPORTING_DAILY_TABLE_HEADERS];

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const TOTAL_BG = "FFD8D6D0";
const BORDER_THIN = { style: "thin" as const };

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

export async function exportToExcel(params: ReportingJournalierExportParams): Promise<void> {
  const { farmName, lot, farmId, selectedDate } = params;

  const [setupList, allDailyList] = await Promise.all([
    api.setupInfo.list(farmId ?? undefined, lot?.trim() || null),
    api.dailyReports.list(farmId ?? undefined, lot ?? undefined),
  ]);

  const totalMale = setupList
    .filter((r) => r.sex === "Mâle")
    .reduce((sum, r) => sum + (r.effectifMisEnPlace ?? 0), 0);
  const totalFemale = setupList
    .filter((r) => r.sex === "Femelle")
    .reduce((sum, r) => sum + (r.effectifMisEnPlace ?? 0), 0);

  // When selectedDate: cumulative filter — day 1 through selectedDay (firstDay <= reportDate <= selectedDate)
  // Use same effective-placement logic as backend. Rows sorted by date asc (day 1, 2, 3...).
  let dailyList: DailyReportResponse[];

  if (selectedDate && selectedDate.trim() !== "") {
    const placementFromSetup = reportingGetFirstDayFromSetup(setupList);
    const minReportDate = allDailyList
      .map((r) => r.reportDate)
      .filter((d): d is string => d != null && d.trim() !== "")
      .reduce<string | null>((min, d) => (min == null || d < min ? d : min), null);
    const firstDay =
      placementFromSetup != null && minReportDate != null
        ? (minReportDate < placementFromSetup ? minReportDate : placementFromSetup)
        : placementFromSetup ?? minReportDate;
    if (firstDay) {
      const filtered = allDailyList.filter(
        (r) => r.reportDate && r.reportDate >= firstDay && r.reportDate <= selectedDate
      );
      dailyList = [...filtered].sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
    } else {
      dailyList = allDailyList
        .filter((r) => r.reportDate && r.reportDate <= selectedDate)
        .sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
    }
  } else {
    dailyList = [...allDailyList].sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const ws = workbook.addWorksheet("Export", {
    views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true }],
  });

  const maxCols = Math.max(EFFECTIF_COLS.length, DAILY_COLS.length);
  ws.columns = Array.from({ length: maxCols }, () => ({ width: 14 }));

  // Title
  ws.mergeCells(1, 1, 1, maxCols);
  const titleCell = ws.getCell("A1");
  titleCell.value = "REPORTING JOURNALIER";
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
  ws.getCell("A4").value = "Lot";
  ws.getCell("B4").value = lot || "—";
  ws.getCell("A4").alignment = { horizontal: "right" };
  [3, 4].forEach((row) => {
    ["A", "B"].forEach((col) => {
      const ref = `${col}${row}`;
      ws.getCell(ref).font = infoStyle.font;
      ws.getCell(ref).fill = infoStyle.fill;
      ws.getCell(ref).border = infoStyle.border;
    });
  });
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 20;
  ws.getRow(5).height = 6;

  let dataRow = 7;
  const headerStyle = {
    font: { size: 10, bold: true, color: { argb: HEADER_TEXT } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: HEADER_PRIMARY } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
    alignment: { horizontal: "center" as const, vertical: "middle" as const },
  };
  const totalStyle = {
    font: { size: 10, bold: true },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: TOTAL_BG } },
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN },
  };

  // ---------- TABLE 1: Effectif Mis en Place ----------
  ws.mergeCells(dataRow, 1, dataRow, EFFECTIF_COLS.length);
  const table1Title = ws.getCell(dataRow, 1);
  table1Title.value = "Effectif Mis en Place";
  table1Title.font = { size: 12, bold: true };
  table1Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
  dataRow++;

  EFFECTIF_COLS.forEach((col, i) => {
    const cell = ws.getCell(dataRow, i + 1);
    cell.value = col;
    Object.assign(cell, { font: headerStyle.font, fill: headerStyle.fill, border: headerStyle.border, alignment: headerStyle.alignment });
  });
  dataRow++;

  const effectifStartRow = dataRow;
  for (let i = 0; i < setupList.length; i++) {
    const arr = reportingEffectifExportRowToArray(setupList[i]!);
    for (let c = 0; c < arr.length; c++) {
      const cell = ws.getCell(dataRow, c + 1);
      cell.value = arr[c];
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      if ((dataRow - effectifStartRow) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
    }
    dataRow++;
  }

  // Table 1 footer: Total Mâle/Femelle (colspan 4), value in Effectif col; Total Général same
  const totalMaleFemaleRow = [
    "Total Mâle / Femelle :",
    "",
    "",
    "",
    `${formatGroupedNumber(totalMale, 0)} / ${formatGroupedNumber(totalFemale, 0)}`,
    "",
    "",
    "",
  ];
  const totalGeneralRow = [
    "Total Général :",
    "",
    "",
    "",
    formatGroupedNumber(totalMale + totalFemale, 0),
    "",
    "",
    "",
  ];
  for (const arr of [totalMaleFemaleRow, totalGeneralRow]) {
    for (let c = 0; c < EFFECTIF_COLS.length; c++) {
      const cell = ws.getCell(dataRow, c + 1);
      cell.value = arr[c] ?? "";
      cell.font = totalStyle.font;
      cell.fill = totalStyle.fill;
      cell.border = totalStyle.border;
    }
    dataRow++;
  }
  dataRow += 2;

  // ---------- TABLE 2: Reporting Journalier — single table, all days in order (day 1, 2, 3...) ----------
  ws.mergeCells(dataRow, 1, dataRow, DAILY_COLS.length);
  const table2Title = ws.getCell(dataRow, 1);
  table2Title.value = "Reporting Journalier";
  table2Title.font = { size: 12, bold: true };
  table2Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
  dataRow++;

  DAILY_COLS.forEach((col, i) => {
    const cell = ws.getCell(dataRow, i + 1);
    cell.value = col;
    Object.assign(cell, { font: headerStyle.font, fill: headerStyle.fill, border: headerStyle.border, alignment: headerStyle.alignment });
  });
  dataRow++;

  const effectivePlacement = reportingGetEffectivePlacement(setupList, dailyList);
  const dailyStartRow = dataRow;
  for (let i = 0; i < dailyList.length; i++) {
    const arr = reportingDailyExportRowToArray(dailyList[i]!, effectivePlacement);
    for (let c = 0; c < arr.length; c++) {
      const cell = ws.getCell(dataRow, c + 1);
      cell.value = arr[c];
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      if ((dataRow - dailyStartRow) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
    }
    dataRow++;
  }

  const totalMortality = dailyList.reduce((s, r) => s + (r.nbr ?? 0), 0);
  const totalMortalityRow = [
    "Total Mortalité :",
    "",
    "",
    "",
    "",
    formatGroupedNumber(totalMortality, 0),
    "",
    "",
    "",
    "",
  ];
  for (let c = 0; c < DAILY_COLS.length; c++) {
    const cell = ws.getCell(dataRow, c + 1);
    cell.value = totalMortalityRow[c] ?? "";
    cell.font = totalStyle.font;
    cell.fill = totalStyle.fill;
    cell.border = totalStyle.border;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileSuffix = selectedDate ? [farmName, `Lot${lot}`, selectedDate] : [farmName, `Lot${lot}`];
  a.download = `Reporting_Journalier_${safeFileName(fileSuffix)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** PDF export (async): fetches data then generates PDF. */
export async function exportToPdf(params: ReportingJournalierExportParams): Promise<void> {
  const { farmName, lot, farmId, selectedDate } = params;

  const [setupList, allDailyList] = await Promise.all([
    api.setupInfo.list(farmId ?? undefined, lot?.trim() || null),
    api.dailyReports.list(farmId ?? undefined, lot ?? undefined),
  ]);

  const totalMale = setupList
    .filter((r) => r.sex === "Mâle")
    .reduce((sum, r) => sum + (r.effectifMisEnPlace ?? 0), 0);
  const totalFemale = setupList
    .filter((r) => r.sex === "Femelle")
    .reduce((sum, r) => sum + (r.effectifMisEnPlace ?? 0), 0);

  let dailyList: DailyReportResponse[];

  if (selectedDate && selectedDate.trim() !== "") {
    const placementFromSetup = reportingGetFirstDayFromSetup(setupList);
    const minReportDate = allDailyList
      .map((r) => r.reportDate)
      .filter((d): d is string => d != null && d.trim() !== "")
      .reduce<string | null>((min, d) => (min == null || d < min ? d : min), null);
    const firstDay =
      placementFromSetup != null && minReportDate != null
        ? (minReportDate < placementFromSetup ? minReportDate : placementFromSetup)
        : placementFromSetup ?? minReportDate;
    if (firstDay) {
      const filtered = allDailyList.filter(
        (r) => r.reportDate && r.reportDate >= firstDay && r.reportDate <= selectedDate
      );
      dailyList = [...filtered].sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
    } else {
      dailyList = allDailyList
        .filter((r) => r.reportDate && r.reportDate <= selectedDate)
        .sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
    }
  } else {
    dailyList = [...allDailyList].sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 297;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("REPORTING JOURNALIER", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.rect(0, 18, pageWidth, 10, "F");
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}`, margin, 24);

  doc.setTextColor(0, 0, 0);
  let startY = 32;

  // ---------- TABLE 1: Effectif Mis en Place ----------
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Effectif Mis en Place", margin, startY);
  startY += 6;

  const effectifBody: string[][] = setupList.map((r) => reportingEffectifExportRowToArray(r).map(String));
  effectifBody.push([
    "Total Mâle / Femelle :",
    "",
    "",
    "",
    `${formatGroupedNumber(totalMale, 0)} / ${formatGroupedNumber(totalFemale, 0)}`,
    "",
    "",
    "",
  ]);
  effectifBody.push([
    "Total Général :",
    "",
    "",
    "",
    formatGroupedNumber(totalMale + totalFemale, 0),
    "",
    "",
    "",
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    head: [EFFECTIF_COLS],
    body: effectifBody,
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
      const isTotal = rowIndex === effectifBody.length - 2;
      const isCumul = rowIndex === effectifBody.length - 1;
      if (isTotal || isCumul) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
      } else if (rowIndex < setupList.length) {
        data.cell.styles.fillColor = rowIndex % 2 === 1 ? [232, 230, 225] : [255, 255, 255];
      }
    },
  });

  const table1EndY = (doc as any).lastAutoTable?.finalY ?? startY + 20;
  startY = table1EndY + 12;

  // ---------- TABLE 2: Reporting Journalier — single table, all days in order (day 1, 2, 3...) ----------
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Reporting Journalier", margin, startY);
  startY += 6;

  const effectivePlacement = reportingGetEffectivePlacement(setupList, dailyList);
  const dailyBody: string[][] = dailyList.map((r) => reportingDailyExportRowToArray(r, effectivePlacement).map(String));
  const totalMortality = dailyList.reduce((s, r) => s + (r.nbr ?? 0), 0);
  dailyBody.push(["Total Mortalité :", "", "", "", "", formatGroupedNumber(totalMortality, 0), "", "", "", ""]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    head: [DAILY_COLS],
    body: dailyBody,
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
      const isTotal = rowIndex === dailyBody.length - 1;
      if (isTotal) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [216, 214, 208];
      } else if (rowIndex < dailyList.length) {
        data.cell.styles.fillColor = rowIndex % 2 === 1 ? [232, 230, 225] : [255, 255, 255];
      }
    },
  });

  const fileSuffix = selectedDate ? [farmName, `Lot${lot}`, selectedDate] : [farmName, `Lot${lot}`];
  doc.save(`Reporting_Journalier_${safeFileName(fileSuffix)}.pdf`);
}
