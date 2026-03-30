/**
 * Shared labels and montant logic for Livraisons paille page and exports (PDF / Excel).
 * QTE uses resolvedQteFromString — same as formatMontantCell on LivraisonsPaille.tsx.
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — matches LivraisonsPaille.tsx thead (before ✓ / actions). */
export const LIVRAISON_PAILLE_TABLE_HEADERS = [
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

export type LivraisonPailleMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

export function livraisonPailleResolvedMontant(row: LivraisonPailleMontantRow): number | null {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return null;
}

export function livraisonPailleEffectiveMontantForTotal(row: LivraisonPailleMontantRow): number {
  return livraisonPailleResolvedMontant(row) ?? 0;
}
