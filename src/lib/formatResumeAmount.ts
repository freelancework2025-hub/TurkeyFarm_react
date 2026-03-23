/**
 * Shared amount formatting for Résumé des coûts hebdomadaires (UI + Excel/PDF exports)
 * and other tables (e.g. Livraisons aliment).
 */

/**
 * Grouped thousands (space) + optional fraction digits (dot as decimal separator).
 * Examples: formatGroupedNumber(54252, 2) → "54 252.00"; formatGroupedNumber(1200, 0) → "1 200"
 */
export function formatGroupedNumber(v: number | null | undefined, fractionDigits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  const neg = v < 0;
  const abs = Math.abs(Number(v));
  const fixed = abs.toFixed(Math.max(0, fractionDigits));
  const [intRaw, frac] = fixed.split(".");
  const intPart = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (fractionDigits === 0) return (neg ? "-" : "") + intPart;
  return (neg ? "-" : "") + `${intPart}.${frac}`;
}

/** Thousands (space) + two decimals with dot (e.g. 160 000.00). */
export function formatResumeAmount(v: number | null | undefined): string {
  return formatGroupedNumber(v, 2);
}

/** Coerce API / JSON values to finite numbers; preserve null when absent or invalid. */
export function toOptionalNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
