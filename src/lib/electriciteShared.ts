/**
 * Shared labels and montant logic for Livraisons électricité page and exports (PDF / Excel).
 * QTE resolves via resolvedQteFromString (expressions) — same as formatMontantCell on the page.
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — matches Electricite.tsx thead (before ✓ / actions). */
export const ELECTRICITE_TABLE_HEADERS = [
  "AGE",
  "DATE",
  "SEM",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "N° BR",
  "QTE",
  "PRIX",
  "MONTANT",
] as const;

export type ElectriciteMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

/** Same rule as formatMontantCell on Electricite.tsx (for TOTAL / CUMUL montant). */
export function electriciteEffectiveMontantForTotal(row: ElectriciteMontantRow): number {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return 0;
}
