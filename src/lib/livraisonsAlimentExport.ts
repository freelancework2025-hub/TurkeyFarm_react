/**
 * Export utilities for Livraisons Aliment.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Excel: client-side ExcelJS only.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface LivraisonRowExport {
  id: string;
  age?: string;
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
  maleQty: string;
  femaleQty: string;
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

const COLS = [
  "AGE",
  "DATE",
  "SEM",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "N° BL",
  "N° BR",
  "QTE",
  "SEX",
  "PRIX",
  "MONTANT",
  "MALE",
  "FEMELLE",
];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function rowToArray(row: LivraisonRowExport, age: string | number): (string | number)[] {
  return [
    age ?? "—",
    safeStr(row.date) || "—",
    safeStr(row.sem) || "—",
    safeStr(row.designation) || "—",
    safeStr(row.supplier) || "—",
    safeStr(row.deliveryNoteNumber) || "—",
    safeStr(row.numeroBonReception) || "—",
    safeStr(row.qte) || "—",
    safeStr(row.sex) === "MALE" ? "Male" : safeStr(row.sex) === "FEMELLE" ? "Femelle" : safeStr(row.sex) || "—",
    safeStr(row.prixPerUnit) || "—",
    safeStr(row.montant) || "—",
    safeStr(row.maleQty) || "—",
    safeStr(row.femaleQty) || "—",
  ];
}

function toConfig(params: LivraisonsAlimentExportParams): ITableExportConfig {
  const { farmName, lot, semaine, rows, weekTotal, cumul, ageByRowId } = params;
  return {
    title: "FICHE DE SUIVI DES LIVRAISONS D'ALIMENT",
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
      "",
      weekTotal.prix,
      weekTotal.montant,
      weekTotal.maleQty,
      weekTotal.femaleQty,
    ],
    cumulRow: [
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
      cumul.maleQty,
      cumul.femaleQty,
    ],
    ageByRowId,
    fileNamePrefix: "Livraisons_Aliment",
    numberFormatColumns: [9, 10], // PRIX, MONTANT
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
