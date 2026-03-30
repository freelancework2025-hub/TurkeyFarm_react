/**
 * Shared labels and display helpers for Liste des employés (page + PDF / Excel).
 */

/** Data columns only — matches Employes.tsx table (before Actions). */
export const EMPLOYES_TABLE_HEADERS = ["Id", "Nom", "Prénom", "Salaire"] as const;

/** Banner title used in PDF / Excel (uppercase). */
export const EMPLOYES_EXPORT_TITLE = "LISTE DES EMPLOYÉS";

/** Same rule as formatSalaire on Employes.tsx */
export function formatEmployeSalaireDisplay(s: number | null | undefined): string {
  if (s == null || Number.isNaN(Number(s))) return "—";
  return Number(s).toFixed(2);
}
