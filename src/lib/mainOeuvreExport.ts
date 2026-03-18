/**
 * Export utilities for Main d'œuvre.
 * Uses generic tableExport (ITableExportConfig) per DIP.
 * Columns: AGE, Date, Semaine, Employé (nom complet), Temps de travail, [Montant], Observation.
 * Employé column shows comma-separated list of employers' full names (Prénom Nom).
 */

import type { ITableExportConfig } from "./tableExport";
import { exportTableToExcel, exportTableToPdf } from "./tableExport";

export interface EmployerEntryExport {
  employerId: number;
  employerNom: string;
  employerPrenom: string;
  fullDay: boolean;
}

export interface MainOeuvreRowExport {
  id: string;
  date: string;
  sem: string;
  entries: EmployerEntryExport[];
  observation: string;
}

export interface EmployerForMontant {
  id: number;
  salaire?: number | null;
}

export interface MainOeuvreExportParams {
  farmName: string;
  lot: string;
  semaine: string;
  rows: MainOeuvreRowExport[];
  employers: EmployerForMontant[];
  ageByRowId: Map<string, string | number>;
  weekTotalJours: number;
  cumulJours: number;
  weekTotalMontant: number;
  cumulMontant: number;
  showMontantColumn: boolean;
}

function formatEmployerNomComplet(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p && !n) return "—";
  return p && n ? `${p} ${n}` : p || n;
}

function entryJours(fullDay: boolean): number {
  return fullDay ? 1 : 0.5;
}

function rowTotalJours(entries: EmployerEntryExport[]): number {
  return entries.reduce((s, e) => s + entryJours(e.fullDay), 0);
}

function rowMontant(row: MainOeuvreRowExport, employers: EmployerForMontant[]): number {
  return row.entries.reduce((sum, e) => {
    const emp = employers.find((x) => x.id === e.employerId);
    const sal = emp?.salaire != null ? Number(emp.salaire) : 0;
    return sum + sal * entryJours(e.fullDay);
  }, 0);
}

function toConfig(params: MainOeuvreExportParams): ITableExportConfig {
  const {
    farmName,
    lot,
    semaine,
    rows,
    employers,
    ageByRowId,
    weekTotalJours,
    cumulJours,
    weekTotalMontant,
    cumulMontant,
    showMontantColumn,
  } = params;

  const columns = showMontantColumn
    ? ["AGE", "Date", "Semaine", "Employé (nom complet)", "Temps de travail", "Montant", "Observation"]
    : ["AGE", "Date", "Semaine", "Employé (nom complet)", "Temps de travail", "Observation"];

  const rowToArray = (row: MainOeuvreRowExport, age: string | number): (string | number)[] => {
    const employeList =
      row.entries.length > 0
        ? row.entries
            .map((e) => formatEmployerNomComplet(e.employerPrenom, e.employerNom))
            .filter((n) => n !== "—")
            .join(", ") || "—"
        : "—";
    const temps = row.entries.length > 0 ? rowTotalJours(row.entries) : "—";
    const base: (string | number)[] = [
      age,
      row.date || "—",
      row.sem || "—",
      employeList,
      temps,
    ];
    if (showMontantColumn) {
      const montant = row.entries.length > 0 ? rowMontant(row, employers) : "—";
      base.push(montant);
    }
    base.push(row.observation?.trim() || "—");
    return base;
  };

  const weekTotalRow: (string | number)[] = [
    `TOTAL ${semaine} (jours)`,
    "",
    "",
    "—",
    weekTotalJours,
  ];
  if (showMontantColumn) weekTotalRow.push(weekTotalMontant);
  weekTotalRow.push("");

  const cumulRow: (string | number)[] = ["CUMUL (jours)", "", "", "—", cumulJours];
  if (showMontantColumn) cumulRow.push(cumulMontant);
  cumulRow.push("");

  const numberFormatColumns: number[] = showMontantColumn
    ? [4, 5] // Temps (index 4), Montant (index 5)
    : [4]; // Temps (index 4)

  const columnWidths = showMontantColumn
    ? [12, 14, 10, 42, 14, 12, 22] // AGE, Date, Semaine, Employé, Temps, Montant, Observation
    : [12, 14, 10, 42, 14, 22]; // AGE, Date, Semaine, Employé, Temps, Observation

  return {
    title: "MAIN D'ŒUVRE",
    columns,
    farmName,
    lot,
    semaine,
    rows,
    rowToArray,
    weekTotalRow,
    cumulRow,
    ageByRowId,
    fileNamePrefix: "Main_Oeuvre",
    numberFormatColumns,
    includeTotals: true,
    columnWidths,
  };
}

export async function exportToExcel(params: MainOeuvreExportParams): Promise<void> {
  await exportTableToExcel(toConfig(params));
}

export function exportToPdf(params: MainOeuvreExportParams): void {
  exportTableToPdf(toConfig(params));
}
