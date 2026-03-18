/**
 * Export utilities for Produits Vétérinaires.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

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

const COLS = [
  "AGE",
  "DATE",
  "SEM",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "UG",
  "QTE",
  "PRIX",
  "MONTANT",
  "N° BR",
];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: VetRowExport, age: string | number): (string | number)[] {
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.ug) || "—",
    safeStr(row.qte) || "—",
    safeStr(row.prixPerUnit) || "—",
    safeStr(row.montant) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
  ];
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
      weekTotal.qte,
      weekTotal.prix,
      weekTotal.montant,
      "",
    ],
    cumulRow: [
      "CUMUL",
      "",
      "",
      "",
      "",
      "",
      cumul.qte,
      cumul.prix,
      cumul.montant,
      "",
    ],
    ageByRowId,
    fileNamePrefix: "Livraisons_Produits_Veterinaires",
    numberFormatColumns: [6, 7, 8], // QTE, PRIX, MONTANT
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
