/**
 * Shared labels, thead classes, and montant logic for Produits vétérinaires page and exports (PDF / Excel).
 * QTE / MONTANT: resolved QTE (formules +/−) and implicit montant (qte × prix) when montant is empty, prix ≥ 0.
 */

import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

/** Data columns only — matches ProduitsVeterinaires.tsx thead (before ✓ / delete). */
export const PRODUITS_VETERINAIRES_TABLE_HEADERS = [
  "AGE",
  "DATE",
  "SEM",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "UG",
  "QTE",
  "PRIX",
  "MONTANT",
  "N° BR",
] as const;

export type ProduitsVeterinairesHeaderKey = (typeof PRODUITS_VETERINAIRES_TABLE_HEADERS)[number];

/** Tailwind classes — matches ProduitsVeterinaires.tsx thead. */
export const PRODUITS_VETERINAIRES_HEADER_CLASS: Record<ProduitsVeterinairesHeaderKey, string> = {
  AGE: "min-w-[70px]",
  DATE: "min-w-[100px]",
  SEM: "min-w-[60px]",
  DÉSIGNATION: "min-w-[180px]",
  FOURNISSEUR: "min-w-[120px]",
  UG: "min-w-[80px]",
  QTE: "min-w-[128px] w-[8.5rem] !text-center",
  PRIX: "min-w-[80px] !text-center",
  MONTANT: "min-w-[90px] !text-center",
  "N° BR": "min-w-[90px]",
};

export const PRODUITS_VETERINAIRES_MAIN_HEADER_TITLE: Partial<Record<ProduitsVeterinairesHeaderKey, string>> = {
  AGE: "Âge séquentiel (1, 2, 3…) sur tout le lot",
  SEM: "Semaine (S1, S2…)",
};

export type ProduitsVeterinairesMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

export function produitsVeterinairesResolvedMontant(row: ProduitsVeterinairesMontantRow): number | null {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return null;
}

export function produitsVeterinairesEffectiveMontantForTotal(row: ProduitsVeterinairesMontantRow): number {
  return produitsVeterinairesResolvedMontant(row) ?? 0;
}
