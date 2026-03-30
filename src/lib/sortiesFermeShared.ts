/**
 * Shared labels, thead classes, and montant logic for Sorties ferme page and exports (PDF / Excel).
 * Montant = saisi ou QTÉ BRUTE × PRIX/KG (QTE résolue via resolvedQteFromString).
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — before ✓ / delete. */
export const SORTIES_FERME_TABLE_HEADERS = [
  "AGE",
  "DATE",
  "SEM",
  "CLIENT",
  "N° BL",
  "TYPE",
  "DÉSIGNATION",
  "NBRE DINDE",
  "QTÉ BRUTE (KG)",
  "PRIX/KG",
  "MONTANT TTC",
] as const;

export type SortiesFermeHeaderKey = (typeof SORTIES_FERME_TABLE_HEADERS)[number];

export const SORTIES_FERME_HEADER_CLASS: Record<SortiesFermeHeaderKey, string> = {
  AGE: "min-w-[70px]",
  DATE: "min-w-[100px]",
  SEM: "min-w-[60px]",
  CLIENT: "min-w-[120px]",
  "N° BL": "min-w-[90px]",
  TYPE: "min-w-[140px]",
  DÉSIGNATION: "min-w-[120px]",
  "NBRE DINDE": "min-w-[96px] !text-center",
  "QTÉ BRUTE (KG)": "min-w-[128px] w-[8.5rem] !text-center",
  "PRIX/KG": "min-w-[80px] !text-center",
  "MONTANT TTC": "min-w-[90px] !text-center",
};

export const SORTIES_FERME_MAIN_HEADER_TITLE: Partial<Record<SortiesFermeHeaderKey, string>> = {
  SEM: "Semaine (VS, S1…)",
};

export function getSortiesFermeAgeHeaderTitle(isVideSanitaireSemaine: boolean): string {
  return isVideSanitaireSemaine
    ? "Pas d'âge en vide sanitaire"
    : "Âge séquentiel depuis S1 (jours), comme Livraisons aliment";
}

/** Colspan for TOTAL / CUMUL label cells (columns before NBRE DINDE). */
export function sortiesFermeTotalRowLabelColSpan(): number {
  return SORTIES_FERME_TABLE_HEADERS.indexOf("NBRE DINDE");
}

export type SortiesFermeMontantRow = Pick<
  { montant_ttc: string; qte_brute_kg: string; prix_kg: string },
  "montant_ttc" | "qte_brute_kg" | "prix_kg"
>;

export function sortiesFermeResolvedMontant(row: SortiesFermeMontantRow): number | null {
  const m = toOptionalNumber(row.montant_ttc);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte_brute_kg);
  const p = toOptionalNumber(row.prix_kg);
  if (q != null && p != null && p >= 0) return q * p;
  return null;
}

export function sortiesFermeEffectiveMontantForTotal(row: SortiesFermeMontantRow): number {
  return sortiesFermeResolvedMontant(row) ?? 0;
}
