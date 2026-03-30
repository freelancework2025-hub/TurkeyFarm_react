/**
 * Export utilities for Livraisons Paille.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  LIVRAISON_PAILLE_TABLE_HEADERS,
  livraisonPailleResolvedMontant,
} from "@/lib/livraisonsPailleShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

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
  videSanitaire?: VideSanitairePaille;
}

const COLS = [...LIVRAISON_PAILLE_TABLE_HEADERS];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: PailleRowExport, age: string | number): (string | number)[] {
  const qte = resolvedQteFromString(row.qte);
  const prix = toOptionalNumber(row.prixPerUnit);
  const montant = livraisonPailleResolvedMontant(row);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBR) || "—",
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

function toConfig(params: LivraisonsPailleExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId, videSanitaire } = params;
  const prefixRows: (string | number)[][] = [];
  if (videSanitaire) {
    const qte = resolvedQteFromString(videSanitaire.qte);
    const prix = toOptionalNumber(videSanitaire.prixPerUnit);
    const montant = livraisonPailleResolvedMontant(videSanitaire);
    prefixRows.push([
      "—",
      safeStr(videSanitaire.date) || "—",
      "—",
      "Vide sanitaire",
      safeStr(videSanitaire.supplier) || "—",
      safeStr(videSanitaire.deliveryNoteNumber) || "—",
      safeStr(videSanitaire.numeroBR) || "—",
      qte == null ? "—" : qte,
      prix == null ? "—" : prix,
      montant == null ? "—" : montant,
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
