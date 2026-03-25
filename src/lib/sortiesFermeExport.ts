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

const COLS = [
  "AGE",
  "DATE",
  "SEM",
  "CLIENT",
  "N° BL",
  "TYPE",
  "DÉSIGNATION",
  "NBRE DINDE",
  "QTÉ BRUTE (KG)",
  "PRIX/KG",
  "MONTANT TTC",
];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function parseExportNum(raw: string | undefined | null): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function rowToArray(row: SortieRowExport, age: string | number): (string | number)[] {
  const nbre = parseExportNum(row.nbre_dinde);
  const qte = parseExportNum(row.qte_brute_kg);
  const prix = parseExportNum(row.prix_kg);
  const montant = parseExportNum(row.montant_ttc);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.semaine) || "—",
    safeStr(row.client) || "—",
    safeStr(row.num_bl) || "—",
    safeStr(row.type) || "—",
    safeStr(row.designation) || "—",
    nbre ?? "—",
    qte ?? "—",
    prix ?? "—",
    montant ?? "—",
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
    weekTotalRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      "",
      "",
      weekTotal.nbre_dinde,
      weekTotal.qte_brute_kg,
      weekTotal.prix_kg,
      weekTotal.montant_ttc,
    ],
    cumulRow: [
      "CUMUL",
      "",
      "",
      "",
      "",
      "",
      "",
      cumul.nbre_dinde,
      cumul.qte_brute_kg,
      cumul.prix_kg,
      cumul.montant_ttc,
    ],
    ageByRowId,
    fileNamePrefix: "Sorties_Ferme",
    numberFormatColumns: [7, 8, 9, 10],
  };
}

export async function exportToExcel(params: SortiesFermeExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: SortiesFermeExportParams): void {
  exportTableToPdf(toConfig(params));
}
