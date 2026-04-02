/**
 * Export utilities for Sorties Ferme.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  SORTIES_FERME_TABLE_HEADERS,
  sortiesFermeResolvedMontant,
} from "@/lib/sortiesFermeShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

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
  ageByRowId?: Map<string, string | number>;
}

const COLS = [...SORTIES_FERME_TABLE_HEADERS];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: SortieRowExport): (string | number)[] {
  const nbre = toOptionalNumber(row.nbre_dinde);
  const qte = resolvedQteFromString(row.qte_brute_kg);
  const prix = toOptionalNumber(row.prix_kg);
  const montant = sortiesFermeResolvedMontant(row);
  return [
    safeStr(row.date) || "—",
    safeStr(row.semaine) || "—",
    safeStr(row.client) || "—",
    safeStr(row.num_bl) || "—",
    safeStr(row.type) || "—",
    safeStr(row.designation) || "—",
    nbre == null ? "—" : nbre,
    qte == null ? "—" : qte,
    prix == null ? "—" : prix,
    montant == null ? "—" : montant,
  ];
}

function pdfRowMapper(cells: (string | number)[]): string[] {
  return cells.map((v, i) => {
    if (i >= 6 && i <= 9) {
      if (v === "—") return "—";
      if (typeof v === "number" && Number.isFinite(v)) {
        const decimals = i === 6 ? 0 : 2;
        return formatGroupedNumber(v, decimals);
      }
    }
    return String(v);
  });
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
      weekTotal.nbre_dinde,
      weekTotal.qte_brute_kg,
      weekTotal.prix_kg,
      weekTotal.montant_ttc,
    ],
    cumulRow: ["CUMUL", "", "", "", "", "", cumul.nbre_dinde, cumul.qte_brute_kg, cumul.prix_kg, cumul.montant_ttc],
    weekTotalPdfRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(weekTotal.nbre_dinde, 0),
      formatGroupedNumber(weekTotal.qte_brute_kg, 2),
      formatGroupedNumber(weekTotal.prix_kg, 2),
      formatGroupedNumber(weekTotal.montant_ttc, 2),
    ],
    cumulPdfRow: [
      "CUMUL",
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(cumul.nbre_dinde, 0),
      formatGroupedNumber(cumul.qte_brute_kg, 2),
      formatGroupedNumber(cumul.prix_kg, 2),
      formatGroupedNumber(cumul.montant_ttc, 2),
    ],
    pdfRowMapper,
    ageByRowId: ageByRowId ?? new Map<string, string | number>(),
    fileNamePrefix: "Sorties_Ferme",
    numberFormatColumns: [6, 7, 8, 9],
  };
}

export async function exportToExcel(params: SortiesFermeExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: SortiesFermeExportParams): void {
  exportTableToPdf(toConfig(params));
}
