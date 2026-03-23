/**
 * Shared row merge / ordering for Résumé coûts (table UI + exports). Keeps Excel bundle out of the table chunk.
 */

import type { SuiviCoutHebdoResponse } from "@/lib/api";

const COMPUTED_ORDER: Record<string, number> = {
  AMORTISSEMENT: 0,
  DINDONNEAUX: 1,
  ALIMENT: 2,
  "PDTS VETERINAIRES": 3,
  "PDTS D'HYGIENE": 4,
  GAZ: 5,
  PAILLE: 6,
  ELECTRICITE: 7,
  "M.O (JOUR DE TRAVAIL)": 8,
  "ENTRETIEN ET REP": 9,
  DIVERS: 10,
};

export function designationOrder(d: string | null | undefined): number {
  const up = d?.toUpperCase();
  return up != null && up in COMPUTED_ORDER ? COMPUTED_ORDER[up] : 10;
}

export function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Same as table logic: cumul when set, else valeurS1 (S1). */
export function getEffectiveCumul(r: SuiviCoutHebdoResponse): number | null {
  const c = toNum(r.cumul);
  if (c != null) return c;
  return toNum(r.valeurS1);
}

/** If both a placeholder and a persisted row exist for AMORTISSEMENT / DINDONNEAUX, keep one row with data (or persisted id). */
export function dedupeAmortissementDindonneaux(rows: SuiviCoutHebdoResponse[]): SuiviCoutHebdoResponse[] {
  const amort: SuiviCoutHebdoResponse[] = [];
  const dind: SuiviCoutHebdoResponse[] = [];
  const rest: SuiviCoutHebdoResponse[] = [];
  for (const r of rows) {
    const k = (r.designation ?? "").toUpperCase().trim();
    if (k === "AMORTISSEMENT") amort.push(r);
    else if (k === "DINDONNEAUX") dind.push(r);
    else rest.push(r);
  }
  const idRank = (id: number | null | undefined) =>
    id != null && id > 0 ? 2 : id != null && id < 0 ? 1 : 0;
  const pickOne = (group: SuiviCoutHebdoResponse[]): SuiviCoutHebdoResponse | null => {
    if (group.length === 0) return null;
    if (group.length === 1) return group[0];
    return group.reduce((best, r) => {
      const eb = getEffectiveCumul(best);
      const er = getEffectiveCumul(r);
      if (er != null && eb == null) return r;
      if (eb != null && er == null) return best;
      if (idRank(r.id) !== idRank(best.id)) return idRank(r.id) > idRank(best.id) ? r : best;
      return best;
    });
  };
  const out: SuiviCoutHebdoResponse[] = [];
  const a = pickOne(amort);
  const d = pickOne(dind);
  if (a) out.push(a);
  if (d) out.push(d);
  out.push(...rest);
  return out;
}

export interface ResumeComputedRowInput {
  designation: string;
  valeurS1: number | null;
  cumul: number | null;
}

export function buildDisplayRows(
  costLines: SuiviCoutHebdoResponse[],
  computedRows: ResumeComputedRowInput[],
  semaine: string,
  farmId: number,
  lot: string
): SuiviCoutHebdoResponse[] {
  const withPlaceholders = [...costLines];
  for (const des of ["AMORTISSEMENT", "DINDONNEAUX"]) {
    if (!withPlaceholders.some((r) => r.designation?.toUpperCase() === des)) {
      withPlaceholders.push({
        id: 0,
        farmId,
        lot,
        semaine,
        designation: des,
        valeurS1: null,
        cumul: null,
      } as SuiviCoutHebdoResponse);
    }
  }
  const computed = computedRows.map((c, idx) => ({
    id: -(idx + 1),
    farmId: 0,
    lot: "",
    semaine: "",
    designation: c.designation,
    valeurS1: c.valeurS1,
    cumul: c.cumul,
  })) as SuiviCoutHebdoResponse[];
  const merged = dedupeAmortissementDindonneaux([...withPlaceholders, ...computed]);
  return merged.sort((a, b) => {
    const oa = designationOrder(a.designation);
    const ob = designationOrder(b.designation);
    if (oa !== ob) return oa - ob;
    return (a.designation ?? "").localeCompare(b.designation ?? "");
  });
}
