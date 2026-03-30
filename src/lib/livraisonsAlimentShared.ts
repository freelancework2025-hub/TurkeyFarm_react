/**
 * Shared labels and montant logic for Livraisons d'aliment page and exports (PDF / Excel).
 * Table columns match the on-screen thead (no separate MÂLE / FEMELLE columns — réparti via SEX).
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — matches LivraisonsAliment.tsx thead (before ✓ / actions). */
export const LIVRAISONS_ALIMENT_TABLE_HEADERS = [
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
] as const;

export type LivraisonsAlimentMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

/** Cell value for export — same as formatMontantCell on the page. */
export function livraisonsAlimentResolvedMontant(row: LivraisonsAlimentMontantRow): number | null {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return null;
}

/** For TOTAL / CUMUL montant line. */
export function livraisonsAlimentEffectiveMontantForTotal(row: LivraisonsAlimentMontantRow): number {
  return livraisonsAlimentResolvedMontant(row) ?? 0;
}
