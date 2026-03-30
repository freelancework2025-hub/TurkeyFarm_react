/**
 * Shared labels and amount logic for Dépenses divers page and exports (PDF / Excel).
 * Keeps table headers and total-line montant math aligned with on-screen cells.
 */

import { toOptionalNumber } from "@/lib/formatResumeAmount";

/**
 * Evaluates a quantity string with + and - only (e.g. "5+2-1" → 6). No eval(); unary +/- on each term supported.
 */
function evaluateQteExpression(input: string): number | null {
  const t = String(input).replace(/[\s\u00A0\u202F]/g, "").replace(/,/g, ".");
  if (t === "") return null;
  if (!/^[0-9.+-]+$/.test(t)) return null;

  let i = 0;
  const readUnaryAndNumber = (): number | null => {
    let sign = 1;
    while (i < t.length && (t[i] === "+" || t[i] === "-")) {
      if (t[i] === "-") sign = -sign;
      i++;
    }
    if (i >= t.length || !/[0-9.]/.test(t[i])) return null;
    const start = i;
    while (i < t.length && /[0-9.]/.test(t[i])) i++;
    const slice = t.slice(start, i);
    if (slice === "" || slice === ".") return null;
    const n = parseFloat(slice);
    return Number.isFinite(n) ? sign * n : null;
  };

  const first = readUnaryAndNumber();
  if (first === null) return null;
  let sum = first;
  while (i < t.length) {
    const op = t[i];
    if (op !== "+" && op !== "-") return null;
    i++;
    const term = readUnaryAndNumber();
    if (term === null) return null;
    sum += op === "+" ? term : -term;
  }
  return Number.isFinite(sum) ? sum : null;
}

/** Resolved numeric QTE for formulas or plain numbers (grouped/decimal comma). */
export function resolvedQteFromString(s: string): number | null {
  const trimmed = String(s).trim();
  if (trimmed === "") return null;
  const ev = evaluateQteExpression(trimmed);
  if (ev != null && Number.isFinite(ev)) return ev;
  return toOptionalNumber(trimmed);
}

/** Vide sanitaire table — data columns only (matches DepensesDivers.tsx thead). */
export const DEPENSES_DIVERS_VS_HEADERS = [
  "DATE",
  "DÉSIGNATION",
  "FOURNISSEUR",
  "N° BL",
  "N° BR",
  "UG",
  "QTE",
  "PRIX",
  "MONTANT",
] as const;

/** Main dépenses divers table — data columns only. */
export const DEPENSES_DIVERS_MAIN_HEADERS = [
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

export type DepenseMontantRow = Pick<
  { montant: string; qte: string; prixPerUnit: string },
  "montant" | "qte" | "prixPerUnit"
>;

/** Same rule as formatMontantCell / resolvedMontant: stored montant or qte × prix. */
export function effectiveMontantForTotal(row: DepenseMontantRow): number {
  const m = toOptionalNumber(row.montant);
  if (m != null) return m;
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return q * p;
  return 0;
}
