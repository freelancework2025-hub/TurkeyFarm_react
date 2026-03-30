/**
 * Shared labels and helpers for Main d'œuvre page and exports (PDF / Excel).
 */

/** Data columns when Montant is hidden (RF, etc.). */
export const MAIN_OEUVRE_TABLE_HEADERS_WITHOUT_MONTANT = [
  "AGE",
  "Date",
  "Semaine",
  "Employé (nom complet)",
  "Temps de travail",
  "Observation",
] as const;

/** Data columns when Montant is visible (Admin / RT / Backoffice employeur). */
export const MAIN_OEUVRE_TABLE_HEADERS_WITH_MONTANT = [
  "AGE",
  "Date",
  "Semaine",
  "Employé (nom complet)",
  "Temps de travail",
  "Montant",
  "Observation",
] as const;

export type MainOeuvreHeaderKey =
  | (typeof MAIN_OEUVRE_TABLE_HEADERS_WITHOUT_MONTANT)[number]
  | "Montant";

/** Tailwind classes — matches MainOeuvre.tsx thead. */
export const MAIN_OEUVRE_HEADER_CLASS: Record<MainOeuvreHeaderKey, string> = {
  AGE: "w-12 min-w-12 max-w-12 shrink-0 px-1 text-center",
  Date: "min-w-[120px]",
  Semaine: "min-w-[70px]",
  "Employé (nom complet)": "min-w-[320px]",
  "Temps de travail": "min-w-[140px]",
  Montant: "min-w-[100px]",
  Observation: "min-w-[180px]",
};

export function getMainOeuvreTableHeaders(showMontant: boolean): readonly string[] {
  return showMontant ? MAIN_OEUVRE_TABLE_HEADERS_WITH_MONTANT : MAIN_OEUVRE_TABLE_HEADERS_WITHOUT_MONTANT;
}

/** Affiche le nom complet : Prénom Nom */
export function formatEmployerNomComplet(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p && !n) return "—";
  return p && n ? `${p} ${n}` : p || n;
}

/** Jours for one entry: 1 if fullDay, 0.5 otherwise */
export function mainOeuvreEntryJours(fullDay: boolean): number {
  return fullDay ? 1 : 0.5;
}

/** Total jours for a row = sum of all entries */
export function mainOeuvreRowTotalJours(entries: { fullDay: boolean }[]): number {
  return entries.reduce((s, e) => s + mainOeuvreEntryJours(e.fullDay), 0);
}

export type MainOeuvreMontantEmployerRef = { id: number; salaire?: number | null };

/** Montant ligne = Σ salaire × jours par entrée (même logique que la page / API). */
export function mainOeuvreRowMontant(
  entries: { employerId: number; fullDay: boolean }[],
  employers: MainOeuvreMontantEmployerRef[]
): number {
  return entries.reduce((sum, e) => {
    const emp = employers.find((x) => x.id === e.employerId);
    const sal = emp?.salaire != null ? Number(emp.salaire) : 0;
    return sum + sal * mainOeuvreEntryJours(e.fullDay);
  }, 0);
}

/** Liste employés pour une cellule export (virgules). */
export function mainOeuvreEmployeListFromEntries(
  entries: { employerPrenom: string; employerNom: string }[]
): string {
  if (entries.length === 0) return "—";
  const joined = entries
    .map((e) => formatEmployerNomComplet(e.employerPrenom, e.employerNom))
    .filter((n) => n !== "—")
    .join(", ");
  return joined || "—";
}
