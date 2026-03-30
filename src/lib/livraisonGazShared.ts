/**
 * Shared labels and montant logic for Livraisons gaz page and exports (PDF / Excel).
 * QTE uses resolvedQteFromString — same as formatMontantCell on LivraisonGaz.tsx.
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — matches LivraisonGaz.tsx thead (before ✓ / actions). */
export const LIVRAISON_GAZ_TABLE_HEADERS = [
  "AGE",
  "DATE",
  "SEM",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "N° BL",
  "N° BR",
  "QTE",
  "PRIX",
  "MONTANT",
] as const;

export type LivraisonGazMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

/** Cell value for export / display: stored montant or resolved QTE × prix. */
export function livraisonGazResolvedMontant(row: LivraisonGazMontantRow): number | null {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return null;
}

/** Same rule as formatMontantCell totals (0 when empty). */
export function livraisonGazEffectiveMontantForTotal(row: LivraisonGazMontantRow): number {
  return livraisonGazResolvedMontant(row) ?? 0;
}
