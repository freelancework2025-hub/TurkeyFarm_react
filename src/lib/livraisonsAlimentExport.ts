/**
 * Export utilities for Livraisons Aliment.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Excel: client-side ExcelJS only.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  LIVRAISONS_ALIMENT_TABLE_HEADERS,
  livraisonsAlimentResolvedMontant,
} from "@/lib/livraisonsAlimentShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

export interface LivraisonRowExport {
  id: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBonReception: string;
  qte: string;
  sex: string;
  prixPerUnit: string;
  montant: string;
}

export interface ExportTotals {
  qte: number;
  prix: number;
  montant: number;
  maleQty: number;
  femaleQty: number;
}

export interface LivraisonsAlimentExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: LivraisonRowExport[];
  weekTotal: ExportTotals;
  cumul: ExportTotals;
  ageByRowId: Map<string, string | number>;
}

const COLS = [...LIVRAISONS_ALIMENT_TABLE_HEADERS];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function sexLabel(sex: string): string {
  const s = safeStr(sex);
  if (s === "MALE") return "Male";
  if (s === "FEMELLE") return "Femelle";
  if (s === "MALE & FEMELLE") return "Male & Femelle";
  return s || "—";
}

function rowToArray(row: LivraisonRowExport, age: string | number): (string | number)[] {
  const qte = resolvedQteFromString(row.qte);
  const prix = toOptionalNumber(row.prixPerUnit);
  const montant = livraisonsAlimentResolvedMontant(row);
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBonReception) || "—",
    qte == null ? "—" : qte,
    sexLabel(row.sex),
    prix == null ? "—" : prix,
    montant == null ? "—" : montant,
  ];
}

function pdfRowMapper(cells: (string | number)[]): string[] {
  return cells.map((v, i) => {
    if (i === 0) return v === "—" ? "—" : String(v);
    if (i === 7 || i === 9 || i === 10) {
      if (v === "—") return "—";
      if (typeof v === "number" && Number.isFinite(v)) return formatGroupedNumber(v, 2);
    }
    return String(v);
  });
}

function toConfig(params: LivraisonsAlimentExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId } = params;
  const weekTotalRow: (string | number)[] = [
    `TOTAL ${semaine}`,
    "",
    "",
    "",
    "",
    "",
    "",
    weekTotal.qte,
    "",
    weekTotal.prix,
    weekTotal.montant,
  ];
  const cumulRow: (string | number)[] = [
    "CUMUL",
    "",
    "",
    "",
    "",
    "",
    "",
    cumul.qte,
    "",
    cumul.prix,
    cumul.montant,
  ];
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS D'ALIMENT",
    columns: COLS,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    weekTotalRow,
    cumulRow,
    weekTotalPdfRow: [
      `TOTAL ${semaine}`,
      "",
      "",
      "",
      "",
      "",
      "",
      formatGroupedNumber(weekTotal.qte, 2),
      "",
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
      "",
      formatGroupedNumber(cumul.prix, 2),
      formatGroupedNumber(cumul.montant, 2),
    ],
    pdfRowMapper,
    ageByRowId,
    fileNamePrefix: "Livraisons_Aliment",
    numberFormatColumns: [7, 9, 10],
  };
}

/** Export Livraisons Aliment to Excel (client-side ExcelJS). */
export async function exportToExcel(params: LivraisonsAlimentExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

/** Export Livraisons Aliment to Excel. Alias for exportToExcel (keeps page import stable). */
export const exportLivraisonsAlimentExcel = exportToExcel;

/** Export Livraisons Aliment to PDF. */
export function exportToPdf(params: LivraisonsAlimentExportParams): void {
  exportTableToPdf(toConfig(params));
}
