/**
 * Export utilities for Fournisseurs (price grid).
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Matrix layout: rows = designations, columns = [Désignation, Fournisseur1, Fournisseur2, ...].
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface FournisseursExportParams {
  farmName: string;
  designations: string[];
  fournisseurs: { id: string; name: string }[];
  prices: Record<number, Record<string, string>>;
}

interface MatrixRow {
  id: string;
  designation: string;
  fournisseurPrices: (string | number)[];
}

function toConfig(params: FournisseursExportParams): ITableExportConfig {
  const { farmName, designations, fournisseurs, prices } = params;
  const columns = ["DÉSIGNATION", ...fournisseurs.map((f) => f.name)];
  const rows: MatrixRow[] = designations.map((des, idx) => ({
    id: String(idx),
    designation: des,
    fournisseurPrices: fournisseurs.map((f) => {
      const v = prices[idx]?.[f.id];
      if (v == null || v.trim() === "") return "—";
      const n = parseFloat(v.replace(",", "."));
      return Number.isNaN(n) ? v : n;
    }),
  }));

  const rowToArray = (row: MatrixRow, _age: string | number): (string | number)[] => [
    row.designation,
    ...row.fournisseurPrices,
  ];

  // Column widths: Désignation wide (matches page min-w-[250px]), fournisseur cols ~150px equivalent
  const columnWidths = [32, ...fournisseurs.map(() => 18)];

  return {
    title: "FOURNISSEURS — PRIX D'ALIMENT",
    columns,
    farmName,
    lot: "—",
    semaine: "—",
    rows,
    rowToArray,
    ageByRowId: new Map(),
    fileNamePrefix: "Fournisseurs_Prix_Aliment",
    numberFormatColumns: fournisseurs.map((_, i) => i + 1), // All fournisseur columns (price)
    includeTotals: false,
    columnWidths,
    hideLotAndSemaine: true,
  };
}

export async function exportToExcel(params: FournisseursExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: FournisseursExportParams): void {
  exportTableToPdf(toConfig(params));
}
