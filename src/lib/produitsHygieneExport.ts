/**
 * Export utilities for Produits Hygiène.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface HygieneRowExport {
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

export interface HygieneExportTotals {
  qte: number;
  prix: number;
  montant: number;
  male: number;
  femelle: number;
}

/** Vide sanitaire: one export line per row (sem VS). */
export interface VideSanitaireHygiene {
  date: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
}

export interface ProduitsHygieneExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: HygieneRowExport[];
  weekTotal: HygieneExportTotals;
  cumul: HygieneExportTotals;
  ageByRowId: Map<string, string | number>;
  /** Vide sanitaire lines at top (multi-ligne). */
  videSanitaireRows?: VideSanitaireHygiene[];
  /** @deprecated Prefer videSanitaireRows */
  videSanitaire?: VideSanitaireHygiene;
}

const COLS = ["AGE", "DATE", "SEM", "DÉSIGNATION", "FOURNISSEUR", "N° BL", "QTE", "PRIX", "MONTANT", "N° BR", "MALE", "FEMELLE"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: HygieneRowExport, age: string | number): (string | number)[] {
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.qte) || "—",
    safeStr(row.prixPerUnit) || "—",
    safeStr(row.montant) || "—",
    safeStr(row.numeroBR) || "—",
    safeStr(row.male) || "—",
    safeStr(row.femelle) || "—",
  ];
}

function toConfig(params: ProduitsHygieneExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaireRows, videSanitaire } = params;
  const prefixRows: (string | number)[][] = [];
  const vsLines =
    videSanitaireRows && videSanitaireRows.length > 0
      ? videSanitaireRows
      : videSanitaire
        ? [videSanitaire]
        : [];
  for (const vs of vsLines) {
    const qte = parseFloat(String(vs.qte).replace(",", "."));
    const prix = parseFloat(String(vs.prixPerUnit).replace(",", "."));
    const montant =
      vs.montant.trim() !== ""
        ? parseFloat(String(vs.montant).replace(",", "."))
        : !Number.isNaN(qte) && !Number.isNaN(prix)
          ? qte * prix
          : 0;
    prefixRows.push([
      "—",
      safeStr(vs.date) || "—",
      "VS",
      "Vide sanitaire",
      safeStr(vs.supplier) || "—",
      safeStr(vs.deliveryNoteNumber) || "—",
      Number.isNaN(qte) ? "—" : qte,
      Number.isNaN(prix) ? "—" : prix,
      Number.isNaN(montant) ? "—" : montant,
      safeStr(vs.numeroBR) || "—",
      "—",
      "—",
    ]);
  }
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS PRODUITS HYGIÈNE",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    prefixRows: prefixRows.length > 0 ? prefixRows : undefined,
    weekTotalRow: [`TOTAL ${semaine}`, "", "", "", "", "", weekTotal.qte, weekTotal.prix, weekTotal.montant, "", weekTotal.male, weekTotal.femelle],
    cumulRow: ["CUMUL", "", "", "", "", "", cumul.qte, cumul.prix, cumul.montant, "", cumul.male, cumul.femelle],
    ageByRowId,
    fileNamePrefix: "Livraisons_Produits_Hygiene",
    numberFormatColumns: [6, 7, 8],
  };
}

export async function exportToExcel(params: ProduitsHygieneExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: ProduitsHygieneExportParams): void {
  exportTableToPdf(toConfig(params));
}
