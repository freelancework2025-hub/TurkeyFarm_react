/**
 * Export utilities for Infos Setup.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Flat table, no TOTAL/CUMUL rows.
 */

import ExcelJS from "exceljs";
import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

export interface SetupRowExport {
  id: string;
  lot: string;
  dateMiseEnPlace: string;
  heureMiseEnPlace: string;
  building: string;
  sex: string;
  effectifMisEnPlace: string;
  typeElevage: string;
  origineFournisseur: string;
  dateEclosion: string;
  souche: string;
}

export interface InfosSetupExportParams {
  farmName: string;
  lot: string;
  rows: SetupRowExport[];
  totalMale: number;
  totalFemale: number;
}

const COLS = ["DATE MISE EN PLACE", "HEURE", "BÂTIMENT", "SEXE", "EFFECTIF", "TYPE ÉLEVAGE", "ORIGINE", "DATE ÉCLOSION", "SOUCHE"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function formatEffectifCell(raw: string): string {
  const n = toOptionalNumber(safeStr(raw) || null);
  if (n == null) return "—";
  return formatGroupedNumber(Math.round(n), 0);
}

function rowToArray(row: SetupRowExport, _age: string | number): (string | number)[] {
  return [
    safeStr(row.dateMiseEnPlace) || "—",
    safeStr(row.heureMiseEnPlace) || "—",
    safeStr(row.building) || "—",
    safeStr(row.sex) || "—",
    formatEffectifCell(row.effectifMisEnPlace),
    safeStr(row.typeElevage) || "—",
    safeStr(row.origineFournisseur) || "—",
    safeStr(row.dateEclosion) || "—",
    safeStr(row.souche) || "—",
  ];
}

function toConfig(params: InfosSetupExportParams): ITableExportConfig {
  const { farmName, lot, rows, totalMale, totalFemale } = params;
  const totalGeneral = totalMale + totalFemale;
  const suffixRows: (string | number)[][] = [
    [
      "",
      "",
      "",
      "Total Mâle / Femelle :",
      `${formatGroupedNumber(totalMale, 0)} / ${formatGroupedNumber(totalFemale, 0)}`,
      "",
      "",
      "",
      "",
    ],
    ["", "", "", "Total Général :", formatGroupedNumber(totalGeneral, 0), "", "", "", ""],
  ];
  return {
    title: "INFOS SETUP",
    columns: COLS,
    farmName,
    lot,
    semaine: "—",
    rows,
    rowToArray,
    ageByRowId: new Map(),
    fileNamePrefix: "Infos_Setup",
    includeTotals: false,
    suffixRows,
    columnWidths: [35, 18, 18, 15, 25, 25, 30, 25, 22], // Significantly wider columns for better Excel display
    hideSemaine: true,
  };
}

export async function exportToExcel(params: InfosSetupExportParams): Promise<void> {
  // Use custom Excel export with explicit column width handling
  const ExcelJS = (await import("exceljs")).default;
  const { farmName, lot, rows, totalMale, totalFemale } = params;
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  const ws = workbook.addWorksheet("Infos Setup", {
    views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true }],
  });

  const HEADER_PRIMARY = "FF3D2E1A";
  const HEADER_TEXT = "FFF7F6F3";
  const TOTAL_BG = "FFD8D6D0";
  const ROW_ALT = "FFE8E6E1";
  const BORDER_THIN = { style: "thin" as const };

  // Set column widths explicitly - this should ensure proper spacing
  ws.columns = [
    { width: 45 }, // DATE MISE EN PLACE - significantly wider
    { width: 18 }, // HEURE
    { width: 18 }, // BÂTIMENT
    { width: 15 }, // SEXE
    { width: 25 }, // EFFECTIF
    { width: 25 }, // TYPE ÉLEVAGE
    { width: 30 }, // ORIGINE
    { width: 25 }, // DATE ÉCLOSION
    { width: 22 }, // SOUCHE
  ];

  // Row 1: Title
  ws.mergeCells(1, 1, 1, COLS.length);
  const titleCell = ws.getCell("A1");
  titleCell.value = "INFOS SETUP";
  titleCell.font = { size: 16, bold: true, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
  titleCell.alignment = { horizontal: "center" };
  titleCell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 6;

  // Info block (Ferme, Lot)
  const infoStyle = { 
    font: { size: 11, bold: true }, 
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE1E0DB" } }, 
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN } 
  };
  
  ws.getCell("A3").value = "Ferme";
  ws.getCell("B3").value = farmName;
  ws.getCell("A4").value = "Lot";
  ws.getCell("B4").value = lot;
  
  ["A3", "B3", "A4", "B4"].forEach((ref) => {
    const cell = ws.getCell(ref);
    cell.font = infoStyle.font;
    cell.fill = infoStyle.fill;
    cell.border = infoStyle.border;
  });
  
  ws.getCell("A3").alignment = { horizontal: "right" };
  ws.getCell("A4").alignment = { horizontal: "right" };
  [3, 4].forEach((r) => ws.getRow(r).height = 20);
  ws.getRow(5).height = 6;

  // Column headers
  const headerStyle = { 
    font: { size: 10, bold: true, color: { argb: HEADER_TEXT } }, 
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: HEADER_PRIMARY } }, 
    border: { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN }, 
    alignment: { horizontal: "center" as const, vertical: "middle" as const } 
  };
  
  COLS.forEach((col, i) => {
    const cell = ws.getCell(6, i + 1);
    cell.value = col;
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.border = headerStyle.border;
    cell.alignment = headerStyle.alignment;
  });
  ws.getRow(6).height = 22;

  let currentRowNum = 7;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const arr = rowToArray(row, "");
    arr.forEach((val, c) => {
      const cell = ws.getCell(currentRowNum, c + 1);
      cell.value = val;
      cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
      if (i % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
      }
      
      // Format DATE MISE EN PLACE column (first column)
      if (c === 0 && typeof val === "string" && val !== "—") {
        // Try to parse as date and format properly
        const dateValue = new Date(val);
        if (!isNaN(dateValue.getTime())) {
          cell.value = dateValue;
          cell.numFmt = "dd/mm/yyyy";
        } else {
          // If not a valid date, keep as string but ensure proper width
          cell.value = val;
        }
      }
      
      // Format EFFECTIF column as number
      if (c === 4 && typeof val === "string" && val !== "—") {
        const num = toOptionalNumber(val);
        if (num != null) {
          cell.value = num;
          cell.numFmt = "#,##0";
        }
      }
    });
    currentRowNum++;
  }

  // Total rows
  const totalGeneral = totalMale + totalFemale;
  
  // Total Mâle / Femelle row
  const totalMFData = ["", "", "", "Total Mâle / Femelle :", `${formatGroupedNumber(totalMale, 0)} / ${formatGroupedNumber(totalFemale, 0)}`, "", "", "", ""];
  totalMFData.forEach((val, c) => {
    const cell = ws.getCell(currentRowNum, c + 1);
    cell.value = val;
    cell.font = { size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
  });
  currentRowNum++;

  // Total Général row
  const totalGeneralData = ["", "", "", "Total Général :", formatGroupedNumber(totalGeneral, 0), "", "", "", ""];
  totalGeneralData.forEach((val, c) => {
    const cell = ws.getCell(currentRowNum, c + 1);
    cell.value = val;
    cell.font = { size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    cell.border = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Infos_Setup_${farmName.replace(/\s+/g, "_")}_Lot${lot}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: InfosSetupExportParams): void {
  exportTableToPdf(toConfig(params));
}
