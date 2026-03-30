/**
 * Shared column labels, grouped weekly header text, and % formatter for
 * Résumé hebdomadaire de la production (WeeklyProductionSummaryContent + Excel/PDF export).
 */

import { formatResumeCoutsPct } from "@/lib/resumeCoutsHebdoShared";

export { formatResumeCoutsPct as formatResumeProductionHebdoPct };

/** Flat header row — Excel, PDF, and logical column order (7 columns). */
export const RESUME_PRODUCTION_WEEKLY_EXPORT_HEADERS = [
  "DATE",
  "ÂGE (J)",
  "MORTALITÉ NBRE",
  "MORTALITÉ %",
  "CUMUL",
  "CUMUL %",
  "CONSO. EAU (L)",
] as const;

export const RESUME_PRODUCTION_WEEKLY_COLUMN_COUNT = RESUME_PRODUCTION_WEEKLY_EXPORT_HEADERS.length;

/** UI row 1 (grouped thead) — matches export semantics. */
export const RESUME_PRODUCTION_WEEKLY_UI_DATE = "DATE";
export const RESUME_PRODUCTION_WEEKLY_UI_AGE = "ÂGE (J)";
export const RESUME_PRODUCTION_WEEKLY_UI_GROUP_MORTALITE = "MORTALITÉ";
export const RESUME_PRODUCTION_WEEKLY_UI_CONSO_EAU = "CONSO. EAU (L)";

/** UI row 2 — sub-headers under MORTALITÉ + spacer above CONSO. */
export const RESUME_PRODUCTION_WEEKLY_SUB_NBRE = "NBRE";
export const RESUME_PRODUCTION_WEEKLY_SUB_PCT = "%";
export const RESUME_PRODUCTION_WEEKLY_SUB_CUMUL = "CUMUL";

export const RESUME_PRODUCTION_TRANSPORT_ROW_LABEL = "MORTALITE DU TRANSPORT";

export function getResumeProductionWeeklyTotalLabel(semaine: string): string {
  return `TOTAL ${semaine.trim() || "—"}`;
}

/** Colspan for first cell of footer total row (DATE + ÂGE). */
export const RESUME_PRODUCTION_WEEKLY_TOTAL_LABEL_COLSPAN = 2;

/** Colspan for transport label cell (DATE + ÂGE + NBRE + % under grouped header). */
export const RESUME_PRODUCTION_TRANSPORT_LABEL_COLSPAN = 4;

/** Suivi livraison — align with export (POIDS (kg)). */
export const RESUME_PRODUCTION_LIVRAISON_TABLE_HEADERS = ["INDICATEUR", "NB", "POIDS (kg)"] as const;

export type ResumeProductionLivraisonHeaderKey = (typeof RESUME_PRODUCTION_LIVRAISON_TABLE_HEADERS)[number];

export const RESUME_PRODUCTION_LIVRAISON_HEADER_CLASS: Record<ResumeProductionLivraisonHeaderKey, string> = {
  INDICATEUR: "px-4 py-2.5 text-left font-semibold text-foreground border-r border-border w-[220px]",
  NB: "px-4 py-2.5 text-center font-semibold text-foreground border-r border-border min-w-[100px]",
  "POIDS (kg)": "px-4 py-2.5 text-center font-semibold text-foreground min-w-[100px]",
};

export const RESUME_PRODUCTION_LIVRAISON_TOTAL_LABEL = "TOTAL";

/** Stock + contrôle des stocks (two colonnes). */
export const RESUME_PRODUCTION_KV_TABLE_HEADERS = ["INDICATEUR", "VALEUR"] as const;

export type ResumeProductionKvHeaderKey = (typeof RESUME_PRODUCTION_KV_TABLE_HEADERS)[number];

export const RESUME_PRODUCTION_KV_HEADER_CLASS: Record<ResumeProductionKvHeaderKey, string> = {
  INDICATEUR: "px-4 py-2.5 text-left font-semibold text-foreground w-[280px]",
  VALEUR: "px-3 py-2.5 text-center font-semibold text-foreground border-l border-border",
};

/** Section « Données mises en place » en PDF (CHAMP / VALEUR). */
export const RESUME_PRODUCTION_SETUP_KV_HEADERS = ["CHAMP", "VALEUR"] as const;

/** Libellé ligne « Écart » — contrôle des stocks (UI + Excel). */
export const RESUME_PRODUCTION_CONTROLE_ECART_LABEL = "Écart";
