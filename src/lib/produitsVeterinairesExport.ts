/**
 * Export utilities for Produits Vétérinaires.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  PRODUITS_VETERINAIRES_TABLE_HEADERS,
  produitsVeterinairesResolvedMontant,
} from "@/lib/produitsVeterinairesShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

export interface VetRowExport {
  id: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  ug: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  deliveryNoteNumber: string;
}

export interface VetExportTotals {
  qte: number;
  prix: number;
  montant: number;
}

export interface ProduitsVeterinairesExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: VetRowExport[];
  weekTotal: VetExportTotals;
  cumul: VetExportTotals;
  ageByRowId: Map<string, string | number>;
}

const COLS = [...PRODUITS_VETERINAIRES_TABLE_HEADERS];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: VetRowExport, age: string | number): (string | number)[] {
  const qte = resolvedQteFromString(row.qte);
  const prix = toOptionalNumber(row.prixPerUnit);
  const montant = produitsVeterinairesResolvedMontant(row);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.ug) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
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

function toConfig(params: ProduitsVeterinairesExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId } = params;
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS PRODUITS VÉTÉRINAIRES",
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
    fileNamePrefix: "Livraisons_Produits_Veterinaires",
    numberFormatColumns: [7, 8, 9],
  };
}

/** Export Produits Vétérinaires to Excel. */
export async function exportToExcel(params: ProduitsVeterinairesExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

/** Export Produits Vétérinaires to PDF. */
export function exportToPdf(params: ProduitsVeterinairesExportParams): void {
  exportTableToPdf(toConfig(params));
}
