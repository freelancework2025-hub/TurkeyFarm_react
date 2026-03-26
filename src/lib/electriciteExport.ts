/**
 * Export utilities for Électricité — aligné sur Electricite.tsx (AGE, DATE, SEM, … QTE, PRIX, MONTANT, N° BR).
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

export interface ElectriciteRowExport {
  id: string;
  date: string;
  /** Semaine affichée (ex. getSemFromRow || semaine courante). */
  sem: string;
  designation: string;
  supplier: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
}

export interface ElectriciteExportTotals {
  qte: number;
  prix: number;
  montant: number;
}

export interface ElectriciteExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: ElectriciteRowExport[];
  weekTotal: ElectriciteExportTotals;
  cumul: ElectriciteExportTotals;
  ageByRowId: Map<string, string | number>;
}

const COLS = ["AGE", "DATE", "SEM", "DÉSIGNATION", "FOURNISSEUR", "QTE", "PRIX", "MONTANT", "N° BR"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

/** Même règle que formatMontantCell sur Electricite.tsx */
function resolvedMontant(row: Pick<ElectriciteRowExport, "montant" | "qte" | "prixPerUnit">): number | null {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = toOptionalNumber(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && q >= 0 && p >= 0) return q * p;
  return null;
}

function rowToArray(row: ElectriciteRowExport, age: string | number): (string | number)[] {
  const qte = toOptionalNumber(row.qte);
  const prix = toOptionalNumber(row.prixPerUnit);
  const montant = resolvedMontant(row);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    qte == null ? "—" : qte,
    prix == null ? "—" : prix,
    montant == null ? "—" : montant,
    safeStr(row.numeroBR) || "—",
  ];
}

function pdfRowMapper(cells: (string | number)[]): string[] {
  return cells.map((v, i) => {
    if (i === 0) return v === "—" ? "—" : String(v);
    if (i >= 5 && i <= 7) {
      if (v === "—") return "—";
      if (typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    }
    return String(v);
  });
}

function toConfig(params: ElectriciteExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId } = params;
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS ÉLECTRICITÉ",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    weekTotalRow: [`TOTAL ${semaine}`, "", "", "", "", weekTotal.qte, weekTotal.prix, weekTotal.montant, ""],
    cumulRow: ["CUMUL", "", "", "", "", cumul.qte, cumul.prix, cumul.montant, ""],
    weekTotalPdfRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      formatGroupedNumber(weekTotal.qte, 2),
      formatGroupedNumber(weekTotal.prix, 2),
      formatGroupedNumber(weekTotal.montant, 2),
      "",
    ],
    cumulPdfRow: [
      "CUMUL",
      "",
      "",
      "",
      "",
      formatGroupedNumber(cumul.qte, 2),
      formatGroupedNumber(cumul.prix, 2),
      formatGroupedNumber(cumul.montant, 2),
      "",
    ],
    pdfRowMapper,
    ageByRowId,
    fileNamePrefix: "Livraisons_Electricite",
    numberFormatColumns: [5, 6, 7],
  };
}

export async function exportToExcel(params: ElectriciteExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: ElectriciteExportParams): void {
  exportTableToPdf(toConfig(params));
}
