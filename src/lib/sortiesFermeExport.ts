/**
 * Export utilities for Sorties Ferme.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface SortieRowExport {
  id: string;
  semaine: string;
  date: string;
  lot: string;
  client: string;
  num_bl: string;
  type: string;
  designation: string;
  nbre_dinde: string;
  qte_brute_kg: string;
  prix_kg: string;
  montant_ttc: string;
}

export interface SortiesFermeExportTotals {
  nbre_dinde: number;
  qte_brute_kg: number;
  prix_kg: number;
  montant_ttc: number;
}

export interface SortiesFermeExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: SortieRowExport[];
  weekTotal: SortiesFermeExportTotals;
  cumul: SortiesFermeExportTotals;
  ageByRowId: Map<string, string | number>;
}

const COLS = ["DATE", "CLIENT", "N° BL", "TYPE", "DÉSIGNATION", "NBRE DINDE", "QTÉ BRUTE (KG)", "PRIX/KG", "MONTANT TTC"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: SortieRowExport, _age: string | number): (string | number)[] {
  return [
    safeStr(row.date) || "—",
    safeStr(row.client) || "—",
    safeStr(row.num_bl) || "—",
    safeStr(row.type) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.nbre_dinde) || "—",
    safeStr(row.qte_brute_kg) || "—",
    safeStr(row.prix_kg) || "—",
    safeStr(row.montant_ttc) || "—",
  ];
}

function toConfig(params: SortiesFermeExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId } = params;
  return {
    title: "SORTIES FERME",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    weekTotalRow: [`TOTAL ${semaine}`, "", "", "", "", weekTotal.nbre_dinde, weekTotal.qte_brute_kg, weekTotal.prix_kg, weekTotal.montant_ttc],
    cumulRow: ["CUMUL", "", "", "", "", cumul.nbre_dinde, cumul.qte_brute_kg, cumul.prix_kg, cumul.montant_ttc],
    ageByRowId,
    fileNamePrefix: "Sorties_Ferme",
    numberFormatColumns: [5, 6, 7, 8],
  };
}

export async function exportToExcel(params: SortiesFermeExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: SortiesFermeExportParams): void {
  exportTableToPdf(toConfig(params));
}
