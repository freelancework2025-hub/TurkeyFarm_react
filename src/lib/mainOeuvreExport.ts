/**
 * Export utilities for Main d'œuvre.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Employé column: comma-separated full names — shared with MainOeuvre.tsx via mainOeuvreShared.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import {
  getMainOeuvreTableHeaders,
  mainOeuvreEmployeListFromEntries,
  mainOeuvreRowMontant,
  mainOeuvreRowTotalJours,
} from "@/lib/mainOeuvreShared";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";

export interface EmployerEntryExport {
  employerId: number;
  employerNom: string;
  employerPrenom: string;
  fullDay: boolean;
}

export interface MainOeuvreRowExport {
  id: string;
  date: string;
  sem: string;
  entries: EmployerEntryExport[];
  observation: string;
}

export interface EmployerForMontant {
  id: number;
  salaire?: number | null;
}

export interface MainOeuvreExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: MainOeuvreRowExport[];
  employers: EmployerForMontant[];
  ageByRowId: Map<string, string | number>;
  weekTotalJours: number;
  cumulJours: number;
  weekTotalMontant: number;
  cumulMontant: number;
  showMontantColumn: boolean;
}

function pdfRowMapper(showMontant: boolean): (cells: (string | number)[]) => string[] {
  const tempsIdx = 4;
  const montantIdx = 5;
  return (cells) =>
    cells.map((v, i) => {
      if (i === 0) return v === "—" ? "—" : String(v);
      if (i === tempsIdx && typeof v === "number" && Number.isFinite(v)) {
        return formatGroupedNumber(v, 2);
      }
      if (showMontant && i === montantIdx && typeof v === "number" && Number.isFinite(v)) {
        return formatGroupedNumber(v, 2);
      }
      return String(v);
    });
}

function toConfig(params: MainOeuvreExportParams): ITableExportConfig {
  const {
    farmName,
    lot,
    semaine,
    rows,
    employers,
    ageByRowId,
    weekTotalJours,
    cumulJours,
    weekTotalMontant,
    cumulMontant,
    showMontantColumn,
  } = params;

  const columns = [...getMainOeuvreTableHeaders(showMontantColumn)];

  const rowToArray = (row: MainOeuvreRowExport, age: string | number): (string | number)[] => {
    const employeList = mainOeuvreEmployeListFromEntries(row.entries);
    const temps = row.entries.length > 0 ? mainOeuvreRowTotalJours(row.entries) : "—";
    const base: (string | number)[] = [age, row.date || "—", row.sem || "—", employeList, temps];
    if (showMontantColumn) {
      const montant = row.entries.length > 0 ? mainOeuvreRowMontant(row.entries, employers) : "—";
      base.push(montant);
    }
    base.push(row.observation?.trim() || "—");
    return base;
  };

  const weekTotalRow: (string | number)[] = [
    `TOTAL ${semaine} (jours)`,
    "",
    "",
    "—",
    weekTotalJours,
  ];
  if (showMontantColumn) weekTotalRow.push(weekTotalMontant);
  weekTotalRow.push("");

  const cumulRow: (string | number)[] = ["CUMUL (jours)", "", "", "—", cumulJours];
  if (showMontantColumn) cumulRow.push(cumulMontant);
  cumulRow.push("");

  const obsIdx = showMontantColumn ? 6 : 5;
  const weekTotalPdfRow = weekTotalRow.map((v, i) => {
    if (i === 4 && typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    if (showMontantColumn && i === 5 && typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    if (i === obsIdx && v === "") return "";
    return String(v);
  });
  const cumulPdfRow = cumulRow.map((v, i) => {
    if (i === 4 && typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    if (showMontantColumn && i === 5 && typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    if (i === obsIdx && v === "") return "";
    return String(v);
  });

  const numberFormatColumns: number[] = showMontantColumn ? [4, 5] : [4];

  const columnWidths = showMontantColumn
    ? [12, 14, 10, 42, 14, 12, 22]
    : [12, 14, 10, 42, 14, 22];

  return {
    title: "MAIN D'ŒUVRE",
    columns,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    weekTotalRow,
    cumulRow,
    weekTotalPdfRow,
    cumulPdfRow,
    pdfRowMapper: pdfRowMapper(showMontantColumn),
    ageByRowId,
    fileNamePrefix: "Main_Oeuvre",
    numberFormatColumns,
    includeTotals: true,
    columnWidths,
  };
}

export async function exportToExcel(params: MainOeuvreExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: MainOeuvreExportParams): void {
  exportTableToPdf(toConfig(params));
}
