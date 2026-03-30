/**
 * Export utilities for Produits Hygiène.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  PRODUITS_HYGIENE_TABLE_HEADERS,
  produitsHygieneResolvedMontant,
} from "@/lib/produitsHygieneShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

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

const COLS = [...PRODUITS_HYGIENE_TABLE_HEADERS];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: HygieneRowExport, age: string | number): (string | number)[] {
  const qte = resolvedQteFromString(row.qte);
  const prix = toOptionalNumber(row.prixPerUnit);
  const montant = produitsHygieneResolvedMontant(row);
  const male = toOptionalNumber(row.male);
  const femelle = toOptionalNumber(row.femelle);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    qte == null ? "—" : qte,
    prix == null ? "—" : prix,
    montant == null ? "—" : montant,
    safeStr(row.numeroBR) || "—",
    male == null ? "—" : male,
    femelle == null ? "—" : femelle,
  ];
}

function pdfRowMapper(cells: (string | number)[]): string[] {
  return cells.map((v, i) => {
    if (i === 0) return v === "—" ? "—" : String(v);
    if (i >= 6 && i <= 8) {
      if (v === "—") return "—";
      if (typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    }
    if (i === 10 || i === 11) {
      if (v === "—") return "—";
      if (typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 0);
    }
    return String(v);
  });
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
    const qte = resolvedQteFromString(vs.qte);
    const prix = toOptionalNumber(vs.prixPerUnit);
    const montant = produitsHygieneResolvedMontant(vs);
    prefixRows.push([
      "—",
      safeStr(vs.date) || "—",
      "VS",
      "Vide sanitaire",
      safeStr(vs.supplier) || "—",
      safeStr(vs.deliveryNoteNumber) || "—",
      qte == null ? "—" : qte,
      prix == null ? "—" : prix,
      montant == null ? "—" : montant,
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
      weekTotal.male,
      weekTotal.femelle,
    ],
    cumulRow: ["CUMUL", "", "", "", "", "", cumul.qte, cumul.prix, cumul.montant, "", cumul.male, cumul.femelle],
    weekTotalPdfRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(weekTotal.qte, 2),
      formatGroupedNumber(weekTotal.prix, 2),
      formatGroupedNumber(weekTotal.montant, 2),
      "",
      formatGroupedNumber(weekTotal.male, 0),
      formatGroupedNumber(weekTotal.femelle, 0),
    ],
    cumulPdfRow: [
      "CUMUL",
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(cumul.qte, 2),
      formatGroupedNumber(cumul.prix, 2),
      formatGroupedNumber(cumul.montant, 2),
      "",
      formatGroupedNumber(cumul.male, 0),
      formatGroupedNumber(cumul.femelle, 0),
    ],
    pdfRowMapper,
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
