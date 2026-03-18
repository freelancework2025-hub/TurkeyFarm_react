/**
 * Export utilities for Livraison Gaz.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface GazRowExport {
  id: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
  male: string;
  femelle: string;
}

export interface GazExportTotals {
  qte: number;
  prix: number;
  montant: number;
  male: number;
  femelle: number;
}

/** Vide sanitaire: single row at top of table (per lot). */
export interface VideSanitaireGaz {
  date: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
}

export interface LivraisonGazExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: GazRowExport[];
  weekTotal: GazExportTotals;
  cumul: GazExportTotals;
  ageByRowId: Map<string, string | number>;
  /** Optional Vide sanitaire row to include at top. */
  videSanitaire?: VideSanitaireGaz;
}

const COLS = ["AGE", "DATE", "SEM", "DÉSIGNATION", "FOURNISSEUR", "QTE", "PRIX", "MONTANT", "N° BL", "N° BR", "MALE", "FEMELLE"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: GazRowExport, age: string | number): (string | number)[] {
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.qte) || "—",
    safeStr(row.prixPerUnit) || "—",
    safeStr(row.montant) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBR) || "—",
    safeStr(row.male) || "—",
    safeStr(row.femelle) || "—",
  ];
}

function toConfig(params: LivraisonGazExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaire } = params;
  const prefixRows: (string | number)[][] = [];
  if (videSanitaire) {
    const qte = parseFloat(String(videSanitaire.qte).replace(",", "."));
    const prix = parseFloat(String(videSanitaire.prixPerUnit).replace(",", "."));
    const montant =
      (videSanitaire.montant ?? "").trim() !== ""
        ? parseFloat(String(videSanitaire.montant).replace(",", "."))
        : (!Number.isNaN(qte) && !Number.isNaN(prix) ? qte * prix : 0);
    prefixRows.push([
      "—",
      safeStr(videSanitaire.date) || "—",
      "—",
      "Vide sanitaire",
      safeStr(videSanitaire.supplier) || "—",
      Number.isNaN(qte) ? "—" : qte,
      Number.isNaN(prix) ? "—" : prix,
      Number.isNaN(montant) ? "—" : montant,
      safeStr(videSanitaire.deliveryNoteNumber) || "—",
      safeStr(videSanitaire.numeroBR) || "—",
      "—",
      "—",
    ]);
  }
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS GAZ",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    prefixRows: prefixRows.length > 0 ? prefixRows : undefined,
    weekTotalRow: [`TOTAL ${semaine}`, "", "", "", "", weekTotal.qte, weekTotal.prix, weekTotal.montant, "", "", weekTotal.male, weekTotal.femelle],
    cumulRow: ["CUMUL", "", "", "", "", cumul.qte, cumul.prix, cumul.montant, "", "", cumul.male, cumul.femelle],
    ageByRowId,
    fileNamePrefix: "Livraisons_Gaz",
    numberFormatColumns: [5, 6, 7],
  };
}

export async function exportToExcel(params: LivraisonGazExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: LivraisonGazExportParams): void {
  exportTableToPdf(toConfig(params));
}
