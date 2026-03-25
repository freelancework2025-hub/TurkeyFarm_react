/**
 * Export utilities for Infos Setup.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Flat table, no TOTAL/CUMUL rows.
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

export interface SetupRowExport {
  id: string;
  lot: string;
  dateMiseEnPlace: string;
  heureMiseEnPlace: string;
  building: string;
  sex: string;
  effectifMisEnPlace: string;
  typeElevage: string;
  origineFournisseur: string;
  dateEclosion: string;
  souche: string;
}

export interface InfosSetupExportParams {
  farmName: string;
  lot: string;
  rows: SetupRowExport[];
  totalMale: number;
  totalFemale: number;
}

const COLS = ["DATE MISE EN PLACE", "HEURE", "BÂTIMENT", "SEXE", "EFFECTIF", "TYPE ÉLEVAGE", "ORIGINE", "DATE ÉCLOSION", "SOUCHE"];

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

function formatEffectifCell(raw: string): string {
  const n = toOptionalNumber(safeStr(raw) || null);
  if (n == null) return "—";
  return formatGroupedNumber(Math.round(n), 0);
}

function rowToArray(row: SetupRowExport, _age: string | number): (string | number)[] {
  return [
    safeStr(row.dateMiseEnPlace) || "—",
    safeStr(row.heureMiseEnPlace) || "—",
    safeStr(row.building) || "—",
    safeStr(row.sex) || "—",
    formatEffectifCell(row.effectifMisEnPlace),
    safeStr(row.typeElevage) || "—",
    safeStr(row.origineFournisseur) || "—",
    safeStr(row.dateEclosion) || "—",
    safeStr(row.souche) || "—",
  ];
}

function toConfig(params: InfosSetupExportParams): ITableExportConfig {
  const { farmName, lot, rows, totalMale, totalFemale } = params;
  const totalGeneral = totalMale + totalFemale;
  const suffixRows: (string | number)[][] = [
    [
      "",
      "",
      "",
      "Total Mâle / Femelle :",
      `${formatGroupedNumber(totalMale, 0)} / ${formatGroupedNumber(totalFemale, 0)}`,
      "",
      "",
      "",
      "",
    ],
    ["", "", "", "Total Général :", formatGroupedNumber(totalGeneral, 0), "", "", "", ""],
  ];
  return {
    title: "INFOS SETUP",
    columns: COLS,
    farmName,
    lot,
    semaine: "—",
    rows,
    rowToArray,
    ageByRowId: new Map(),
    fileNamePrefix: "Infos_Setup",
    includeTotals: false,
    suffixRows,
    columnWidths: [20, 12, 12, 16, 14, 18, 18, 18, 16], // DATE MISE EN PLACE, SEXE, EFFECTIF, TYPE ÉLEVAGE, ORIGINE, DATE ÉCLOSION, SOUCHE wider
    hideSemaine: true,
  };
}

export async function exportToExcel(params: InfosSetupExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: InfosSetupExportParams): void {
  exportTableToPdf(toConfig(params));
}
