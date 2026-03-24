/**
 * Export utilities for Livraisons Paille.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface PailleRowExport {
  id: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  deliveryNoteNumber: string;
  numeroBR: string;
}

export interface PailleExportTotals {
  qte: number;
  prix: number;
  montant: number;
}

/** Vide sanitaire: single row at top of table (per lot). */
export interface VideSanitairePaille {
  date: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
}

export interface LivraisonsPailleExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: PailleRowExport[];
  weekTotal: PailleExportTotals;
  cumul: PailleExportTotals;
  ageByRowId: Map<string, string | number>;
  /** Optional Vide sanitaire row to include at top. */
  videSanitaire?: VideSanitairePaille;
}

/** Same order as Livraisons Aliment / page UI: N° BL, N° BR before QTE, PRIX, MONTANT. */
const COLS = ["AGE", "DATE", "SEM", "DÉSIGNATION", "FOURNISSEUR", "N° BL", "N° BR", "QTE", "PRIX", "MONTANT"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: PailleRowExport, age: string | number): (string | number)[] {
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBR) || "—",
    safeStr(row.qte) || "—",
    safeStr(row.prixPerUnit) || "—",
    safeStr(row.montant) || "—",
  ];
}

function toConfig(params: LivraisonsPailleExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaire } = params;
  const prefixRows: (string | number)[][] = [];
  if (videSanitaire) {
    const qte = parseFloat(String(videSanitaire.qte).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
    const prix = parseFloat(String(videSanitaire.prixPerUnit).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
    const montant =
      (videSanitaire.montant ?? "").trim() !== ""
        ? parseFloat(String(videSanitaire.montant).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."))
        : !Number.isNaN(qte) && !Number.isNaN(prix)
          ? qte * prix
          : NaN;
    prefixRows.push([
      "—",
      safeStr(videSanitaire.date) || "—",
      "—",
      "Vide sanitaire",
      safeStr(videSanitaire.supplier) || "—",
      safeStr(videSanitaire.deliveryNoteNumber) || "—",
      safeStr(videSanitaire.numeroBR) || "—",
      Number.isNaN(qte) ? "—" : qte,
      Number.isNaN(prix) ? "—" : prix,
      Number.isNaN(montant) ? "—" : montant,
    ]);
  }
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS PAILLE",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    prefixRows: prefixRows.length > 0 ? prefixRows : undefined,
    weekTotalRow: [`TOTAL ${semaine}`, "", "", "", "", "", "", weekTotal.qte, weekTotal.prix, weekTotal.montant],
    cumulRow: ["CUMUL", "", "", "", "", "", "", cumul.qte, cumul.prix, cumul.montant],
    ageByRowId,
    fileNamePrefix: "Livraisons_Paille",
    numberFormatColumns: [7, 8, 9],
  };
}

export async function exportToExcel(params: LivraisonsPailleExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: LivraisonsPailleExportParams): void {
  exportTableToPdf(toConfig(params));
}
