/**
 * Export utilities for Électricité.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface ElectriciteRowExport {
  id: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
}

export interface ElectriciteExportTotals {
  qte: number;
  prix: number;
  montant: number;
}

export interface ElectriciteExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: ElectriciteRowExport[];
  weekTotal: ElectriciteExportTotals;
  cumul: ElectriciteExportTotals;
  ageByRowId: Map<string, string | number>;
}

const COLS = ["AGE", "DATE", "SEM", "DÉSIGNATION", "FOURNISSEUR", "QTE", "PRIX", "MONTANT", "N° BR"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: ElectriciteRowExport, age: string | number): (string | number)[] {
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.qte) || "—",
    safeStr(row.prixPerUnit) || "—",
    safeStr(row.montant) || "—",
    safeStr(row.numeroBR) || "—",
  ];
}

function toConfig(params: ElectriciteExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId } = params;
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS ÉLECTRICITÉ",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    weekTotalRow: [`TOTAL ${semaine}`, "", "", "", "", weekTotal.qte, weekTotal.prix, weekTotal.montant, ""],
    cumulRow: ["CUMUL", "", "", "", "", cumul.qte, cumul.prix, cumul.montant, ""],
    ageByRowId,
    fileNamePrefix: "Livraisons_Electricite",
    numberFormatColumns: [5, 6, 7],
  };
}

export async function exportToExcel(params: ElectriciteExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: ElectriciteExportParams): void {
  exportTableToPdf(toConfig(params));
}
