/**
 * Shared column labels, thead styling, and row/age helpers for Reporting journalier
 * (Effectif mis en place + rapport journalier UI and Excel/PDF export).
 */

import type { SetupInfoResponse, DailyReportResponse } from "@/lib/api";

/** Table 1 — matches EffectifMisEnPlace.tsx (data columns only). */
export const REPORTING_EFFECTIF_TABLE_HEADERS = [
  "DATE MISE EN PLACE",
  "HEURE",
  "BÂTIMENT",
  "SEXE",
  "EFFECTIF INITIAL",
  "TYPE D'ÉLEVAGE",
  "FOURNISSEUR",
  "SOUCHE",
] as const;

export type ReportingEffectifHeaderKey = (typeof REPORTING_EFFECTIF_TABLE_HEADERS)[number];

export const REPORTING_EFFECTIF_HEADER_CLASS: Record<ReportingEffectifHeaderKey, string> = {
  "DATE MISE EN PLACE": "min-w-[110px]",
  HEURE: "min-w-[72px]",
  BÂTIMENT: "min-w-[120px]",
  SEXE: "min-w-[88px]",
  "EFFECTIF INITIAL": "min-w-[112px] !text-center",
  "TYPE D'ÉLEVAGE": "min-w-[120px]",
  FOURNISSEUR: "min-w-[120px]",
  SOUCHE: "min-w-[100px]",
};

/** Table 2 — matches DailyReportTable.tsx (data columns only, before ✓ / delete). */
export const REPORTING_DAILY_TABLE_HEADERS = [
  "AGE",
  "DATE",
  "SEM",
  "BÂTIMENT",
  "DÉSIGNATION",
  "NBR (MORTALITÉ)",
  "CONSO. EAU (L)",
  "TEMP. MIN",
  "TEMP. MAX",
  "TRAITEMENT",
] as const;

export type ReportingDailyHeaderKey = (typeof REPORTING_DAILY_TABLE_HEADERS)[number];

export const REPORTING_DAILY_HEADER_CLASS: Record<ReportingDailyHeaderKey, string> = {
  AGE: "min-w-[70px]",
  DATE: "min-w-[100px]",
  SEM: "min-w-[56px]",
  BÂTIMENT: "min-w-[120px]",
  DÉSIGNATION: "min-w-[100px]",
  "NBR (MORTALITÉ)": "min-w-[96px] !text-center",
  "CONSO. EAU (L)": "min-w-[128px] w-[8.5rem] !text-center",
  "TEMP. MIN": "min-w-[88px] !text-center",
  "TEMP. MAX": "min-w-[88px] !text-center",
  TRAITEMENT: "min-w-[120px]",
};

export const REPORTING_DAILY_MAIN_HEADER_TITLE: Partial<Record<ReportingDailyHeaderKey, string>> = {
  AGE: "Âge (jours)",
};

/** Colspan for « Total mortalité » label (columns before NBR). */
export function reportingDailyTotalMortalityLabelColSpan(): number {
  return REPORTING_DAILY_TABLE_HEADERS.indexOf("NBR (MORTALITÉ)");
}

/** Colspan after NBR column in tfoot (rest of data cols + optional ✓ + delete). */
export function reportingDailyTrailColSpanAfterNbr(showSaveCol: boolean, showDeleteCol: boolean): number {
  const afterNbr =
    REPORTING_DAILY_TABLE_HEADERS.length - reportingDailyTotalMortalityLabelColSpan() - 1;
  return afterNbr + (showSaveCol ? 1 : 0) + (showDeleteCol ? 1 : 0);
}

function safeStr(s: string | undefined | null): string {
  return s != null ? String(s).trim() : "";
}

/** Min date mise en place from setup rows. */
export function reportingGetFirstDayFromSetup(setupList: SetupInfoResponse[]): string | null {
  const dates = setupList
    .map((r) => r.dateMiseEnPlace)
    .filter((d): d is string => d != null && String(d).trim() !== "");
  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (d < min ? d : min), dates[0]!);
}

/**
 * Âge (jours) depuis la mise en place — même formule que DailyReportTable / export / backend.
 * age = reportDate - placementDate + 1, minimum 1 (UTC).
 */
export function computeReportingAgeFromPlacement(reportDate: string, placementDate: string): number {
  const report = new Date(reportDate);
  const placement = new Date(placementDate);
  report.setUTCHours(0, 0, 0, 0);
  placement.setUTCHours(0, 0, 0, 0);
  const diffTime = report.getTime() - placement.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

export function computeReportingAgeAndSemaine(
  reportDate: string,
  placementDate: string
): { age: number; semaine: number } {
  const age = computeReportingAgeFromPlacement(reportDate, placementDate);
  return { age, semaine: Math.ceil(age / 7) };
}

/** Placement effectif pour âge/sem : min(setup, min date rapport). */
export function reportingGetEffectivePlacement(
  setupList: SetupInfoResponse[],
  dailyList: DailyReportResponse[]
): string | null {
  const placementFromSetup = reportingGetFirstDayFromSetup(setupList);
  const minReportDate = dailyList
    .map((r) => r.reportDate)
    .filter((d): d is string => d != null && String(d).trim() !== "")
    .reduce<string | null>((min, d) => (min == null || d < min ? d : min), null);
  if (placementFromSetup != null && minReportDate != null) {
    return minReportDate < placementFromSetup ? minReportDate : placementFromSetup;
  }
  return placementFromSetup ?? minReportDate ?? null;
}

export function reportingEffectifExportRowToArray(r: SetupInfoResponse): (string | number)[] {
  return [
    safeStr(r.dateMiseEnPlace) || "—",
    safeStr(r.heureMiseEnPlace) || "—",
    safeStr(r.building) || "—",
    safeStr(r.sex) || "—",
    r.effectifMisEnPlace != null ? String(r.effectifMisEnPlace) : "—",
    safeStr(r.typeElevage) || "—",
    safeStr(r.origineFournisseur) || "—",
    safeStr(r.souche) || "—",
  ];
}

/** Ligne export / PDF tableau journalier (ordre = REPORTING_DAILY_TABLE_HEADERS). */
export function reportingDailyExportRowToArray(
  r: DailyReportResponse,
  effectivePlacement: string | null
): (string | number)[] {
  const reportDate = safeStr(r.reportDate);
  const ageNum =
    effectivePlacement && reportDate
      ? computeReportingAgeFromPlacement(reportDate, effectivePlacement)
      : r.ageJour ?? null;
  const age = ageNum != null ? String(ageNum) : "—";
  const sem =
    ageNum != null
      ? `S${Math.ceil(ageNum / 7)}`
      : r.semaine != null
        ? String(r.semaine).match(/^\d+$/)
          ? `S${r.semaine}`
          : String(r.semaine)
        : "—";
  return [
    age,
    reportDate || "—",
    sem,
    safeStr(r.building) || "—",
    safeStr(r.designation) || "—",
    r.nbr != null ? String(r.nbr) : "—",
    r.waterL != null ? String(r.waterL) : "—",
    r.tempMin != null ? String(r.tempMin) : "—",
    r.tempMax != null ? String(r.tempMax) : "—",
    safeStr(r.traitement) || "—",
  ];
}
