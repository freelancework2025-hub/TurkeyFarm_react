/**
 * Shared labels, thead classes, and montant logic for Produits hygiène page and exports (PDF / Excel).
 * QTE / MONTANT align with the grid: resolved QTE and implicit montant (qte × prix) when montant is empty.
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — matches ProduitsHygiene.tsx thead (before ✓ / delete). */
export const PRODUITS_HYGIENE_TABLE_HEADERS = [
  "AGE",
  "DATE",
  "SEM",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "N° BL",
  "QTE",
  "PRIX",
  "MONTANT",
  "N° BR",
  "MALE",
  "FEMELLE",
] as const;

export type ProduitsHygieneHeaderKey = (typeof PRODUITS_HYGIENE_TABLE_HEADERS)[number];

/** Tailwind classes — matches ProduitsHygiene.tsx thead. */
export const PRODUITS_HYGIENE_HEADER_CLASS: Record<ProduitsHygieneHeaderKey, string> = {
  AGE: "min-w-[70px]",
  DATE: "min-w-[100px]",
  SEM: "min-w-[60px]",
  DÉSIGNATION: "min-w-[180px]",
  FOURNISSEUR: "min-w-[120px]",
  "N° BL": "min-w-[90px]",
  QTE: "min-w-[128px] w-[8.5rem] !text-center",
  PRIX: "min-w-[80px] !text-center",
  MONTANT: "min-w-[90px] !text-center",
  "N° BR": "min-w-[90px]",
  MALE: "min-w-[70px] !text-center",
  FEMELLE: "min-w-[80px] !text-center",
};

/** Optional title on main table only (VS table leaves AGE/SEM without tooltips). */
export const PRODUITS_HYGIENE_MAIN_HEADER_TITLE: Partial<Record<ProduitsHygieneHeaderKey, string>> = {
  AGE: "Âge séquentiel (1, 2, 3…) sur tout le lot",
  SEM: "Semaine (S1, S2…)",
};

export type ProduitsHygieneMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

/** Resolved montant for export / display: stored value or QTE × PRIX. */
export function produitsHygieneResolvedMontant(row: ProduitsHygieneMontantRow): number | null {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return null;
}

/** Totals: same rule as MONTANT cell (0 when nothing resolvable). */
export function produitsHygieneEffectiveMontantForTotal(row: ProduitsHygieneMontantRow): number {
  return produitsHygieneResolvedMontant(row) ?? 0;
}
