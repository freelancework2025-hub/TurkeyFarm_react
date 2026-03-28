import type { DailyReportResponse, SuiviTechniqueHebdoResponse } from "@/lib/api";

/** Align with SuiviTechniqueHebdomadaire — daily UI may use "Bâtiment 01". */
export function normalizeBatimentName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  if (/^B\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^Bâtiment\s*0*(\d+)$/i);
  if (match) return `B${match[1]}`;
  return trimmed;
}

export function parseSemaineIndex(semaine: string): number | null {
  const m = semaine.trim().match(/^S(\d+)$/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/** Exported for WeeklyTrackingTable: detect when journalier data should be persisted into suivi hebdo. */
export function dailyReportMatchesSuiviContext(
  d: DailyReportResponse,
  opts: { lot: string; batiment: string; sex: string; semaine: string }
): boolean {
  const lotOk = !opts.lot.trim() || (d.lot?.trim() ?? "") === opts.lot.trim();
  if (!lotOk) return false;
  if (d.designation !== opts.sex) return false;
  const w = parseSemaineIndex(opts.semaine);
  if (w == null || d.semaine == null) return false;
  if (d.semaine !== w) return false;
  return normalizeBatimentName(d.building) === normalizeBatimentName(opts.batiment);
}

/** Row shape aligned with WeeklyTrackingTable `WeeklyRow` (without importing the component). */
export interface MergedWeeklyHebdoRow {
  id: string;
  recordDate: string;
  ageJour: string;
  mortaliteNbre: string;
  mortalitePct: string;
  mortaliteCumul: string;
  mortaliteCumulPct: string;
  /** Mortalité du transport — cumul fin semaine précédente (calculé côté backend) */
  mortaliteTransportCumul?: number | null;
  consoEauL: string;
  tempMin: string;
  tempMax: string;
  vaccination: string;
  traitement: string;
  observation: string;
  isPlaceholder?: boolean;
}

function normalizeDecFromApi(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = String(v).replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? String(n) : String(v);
}

function hebdoToMerged(r: SuiviTechniqueHebdoResponse): MergedWeeklyHebdoRow {
  return {
    id: String(r.id),
    recordDate: r.recordDate,
    ageJour: r.ageJour != null ? String(r.ageJour) : "",
    mortaliteNbre: r.mortaliteNbre != null ? String(r.mortaliteNbre) : "",
    mortalitePct: r.mortalitePct != null ? r.mortalitePct.toFixed(2) : "",
    mortaliteCumul: r.mortaliteCumul != null ? String(r.mortaliteCumul) : "",
    mortaliteCumulPct: r.mortaliteCumulPct != null ? r.mortaliteCumulPct.toFixed(2) : "",
    mortaliteTransportCumul: r.mortaliteTransportCumul,
    consoEauL: r.consoEauL != null ? String(r.consoEauL) : "",
    tempMin: r.tempMin != null ? String(r.tempMin) : "",
    tempMax: r.tempMax != null ? String(r.tempMax) : "",
    vaccination: r.vaccination ?? "",
    traitement: r.traitement ?? "",
    observation: r.observation ?? "",
    isPlaceholder:
      r.isPlaceholder ?? (r.ageJour == null && r.mortaliteNbre == null && r.consoEauL == null),
  };
}

function applyDailyOntoRow(row: MergedWeeklyHebdoRow, d: DailyReportResponse): MergedWeeklyHebdoRow {
  return {
    ...row,
    recordDate: d.reportDate,
    ageJour: d.ageJour != null ? String(d.ageJour) : row.ageJour,
    mortaliteNbre: d.nbr != null ? String(d.nbr) : row.mortaliteNbre,
    consoEauL: d.waterL != null ? normalizeDecFromApi(d.waterL) : row.consoEauL,
    tempMin: d.tempMin != null ? normalizeDecFromApi(d.tempMin) : row.tempMin,
    tempMax: d.tempMax != null ? normalizeDecFromApi(d.tempMax) : row.tempMax,
    traitement: d.traitement != null && d.traitement !== "" ? d.traitement : row.traitement,
    // Preserve calculated values from backend instead of clearing them
    mortalitePct: row.mortalitePct,
    mortaliteCumul: row.mortaliteCumul,
    mortaliteCumulPct: row.mortaliteCumulPct,
    mortaliteTransportCumul: row.mortaliteTransportCumul,
    isPlaceholder: false,
  };
}

function newRowFromDaily(d: DailyReportResponse): MergedWeeklyHebdoRow {
  const base: MergedWeeklyHebdoRow = {
    id: crypto.randomUUID(),
    recordDate: d.reportDate,
    ageJour: d.ageJour != null ? String(d.ageJour) : "",
    mortaliteNbre: d.nbr != null ? String(d.nbr) : "",
    mortalitePct: "",
    mortaliteCumul: "",
    mortaliteCumulPct: "",
    mortaliteTransportCumul: null,
    consoEauL: d.waterL != null ? normalizeDecFromApi(d.waterL) : "",
    tempMin: d.tempMin != null ? normalizeDecFromApi(d.tempMin) : "",
    tempMax: d.tempMax != null ? normalizeDecFromApi(d.tempMax) : "",
    vaccination: "",
    traitement: d.traitement ?? "",
    observation: "",
    isPlaceholder: false,
  };
  return base;
}

/**
 * Union of suivi hebdo rows and reporting journalier lines for the same lot / bâtiment / sexe / semaine.
 * For each date present in either source, reporting journalier overwrites âge, mortalité (NBR), eau, T°, traitement.
 * Vaccination and observation stay from suivi hebdo when a saved hebdo line exists for that date.
 */
function mergedRowHasUserFilledLine(r: MergedWeeklyHebdoRow): boolean {
  return Boolean(
    (r.ageJour?.trim() ?? "") !== "" ||
      (r.mortaliteNbre?.trim() ?? "") !== "" ||
      (r.consoEauL?.trim() ?? "") !== "" ||
      (r.vaccination?.trim() ?? "") !== "" ||
      (r.traitement?.trim() ?? "") !== "" ||
      (r.observation?.trim() ?? "") !== ""
  );
}

/**
 * Date to attach auto-saved « effectif départ » (S2+): never use a random « today » outside the week,
 * which created an extra DB row and an 8th line that flickered vs loads without that row.
 */
export function resolveAnchorRecordDateForEffectif(
  hebdoList: SuiviTechniqueHebdoResponse[],
  dailyList: DailyReportResponse[],
  opts: { lot: string; batiment: string; sex: string; semaine: string },
  fallbackIsoDate: string
): string {
  const fromHebdo = [...hebdoList]
    .map((h) => h.recordDate)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (fromHebdo.length > 0) return fromHebdo[0];

  const dailyWeek = dailyList.filter((d) => dailyReportMatchesSuiviContext(d, opts));
  const fromDaily = [...new Set(dailyWeek.map((d) => d.reportDate))].sort((a, b) => a.localeCompare(b));
  if (fromDaily.length > 0) return fromDaily[0];

  return fallbackIsoDate;
}

export function mergeHebdoRowsWithDailyReports(
  hebdoList: SuiviTechniqueHebdoResponse[],
  dailyList: DailyReportResponse[],
  opts: { lot: string; batiment: string; sex: string; semaine: string }
): MergedWeeklyHebdoRow[] {
  const dailyWeek = dailyList.filter((d) => dailyReportMatchesSuiviContext(d, opts));
  const dailyByDate = new Map<string, DailyReportResponse>();
  for (const d of dailyWeek) {
    dailyByDate.set(d.reportDate, d);
  }

  const hebdoByDate = new Map<string, SuiviTechniqueHebdoResponse>();
  for (const h of hebdoList) {
    if (h.recordDate) hebdoByDate.set(h.recordDate, h);
  }

  const dates = [...new Set([...hebdoByDate.keys(), ...dailyByDate.keys()])].sort((a, b) =>
    a.localeCompare(b)
  );

  const out: MergedWeeklyHebdoRow[] = [];
  for (const date of dates) {
    const h = hebdoByDate.get(date);
    const day = dailyByDate.get(date);
    if (h && day) {
      out.push(applyDailyOntoRow(hebdoToMerged(h), day));
    } else if (h) {
      out.push(hebdoToMerged(h));
    } else if (day) {
      out.push(newRowFromDaily(day));
    }
  }

  // Drop orphan placeholder lines (e.g. old auto-save on « today ») outside the reporting span for this week.
  if (dailyByDate.size > 0) {
    const sortedDailyDates = [...dailyByDate.keys()].sort((a, b) => a.localeCompare(b));
    const minD = sortedDailyDates[0];
    const maxD = sortedDailyDates[sortedDailyDates.length - 1];
    return out.filter((row) => {
      if (dailyByDate.has(row.recordDate)) return true;
      if (mergedRowHasUserFilledLine(row)) return true;
      return row.recordDate >= minD && row.recordDate <= maxD;
    });
  }

  return out;
}
