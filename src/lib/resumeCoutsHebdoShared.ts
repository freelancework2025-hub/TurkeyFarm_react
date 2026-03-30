/**
 * Shared column labels, thead classes, and % formatter for Résumé des coûts hebdomadaires
 * (ResumeCoutsHebdoTable + Excel/PDF export).
 */

import { formatGroupedNumber } from "@/lib/formatResumeAmount";

/** Libellé ligne total — identique UI / export. */
export const RESUME_COUTS_FOOTER_TOTAL_LABEL = "Total";

/**
 * En-têtes tableau « PRIX DE REVIENT » — 2e colonne = semaine courante (S1, S2…).
 */
export function getResumeCoutsPrixRevientHeaders(semaine: string): string[] {
  return ["DESIGNATION", semaine.trim() || "—", "CUMUL", "CUMUL DH/KG", "%"];
}

export const RESUME_COUTS_PRIX_REVIENT_COLUMN_COUNT = 5;

/** Classes `<th>` par index (colonne semaine = index 1, libellé dynamique). */
export const RESUME_COUTS_PRIX_REVIENT_HEADER_CLASS: readonly string[] = [
  "px-4 py-2.5 text-left font-semibold text-foreground border-r border-border min-w-[180px]",
  "px-3 py-2.5 text-center font-semibold text-foreground border-r border-border min-w-[112px] !text-center",
  "px-3 py-2.5 text-center font-semibold text-foreground border-r border-border min-w-[112px] !text-center",
  "px-3 py-2.5 text-center font-semibold text-foreground border-r border-border whitespace-nowrap min-w-[112px] !text-center",
  "px-3 py-2.5 text-center font-semibold text-foreground min-w-[88px] !text-center",
];

/** Tableau PRIX DE REVIENT/SUJET — sous le tableau principal. */
export const RESUME_COUTS_INDICATEUR_TABLE_HEADERS = ["INDICATEUR", "VALEUR"] as const;

export type ResumeCoutsIndicateurHeaderKey = (typeof RESUME_COUTS_INDICATEUR_TABLE_HEADERS)[number];

export const RESUME_COUTS_INDICATEUR_HEADER_CLASS: Record<ResumeCoutsIndicateurHeaderKey, string> = {
  INDICATEUR: "px-4 py-2.5 text-left font-semibold text-foreground min-w-[200px]",
  VALEUR:
    "px-3 py-2.5 text-center font-semibold text-foreground border-l border-border min-w-[128px] !text-center",
};

export function formatResumeCoutsPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${formatGroupedNumber(value, 2)} %`;
}
