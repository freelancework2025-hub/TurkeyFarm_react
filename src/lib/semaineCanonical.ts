/**
 * Align with backend {@code SemaineHelper}: S01 / s2 → S1 / S2 so week keys match DB and transport chain.
 */
export function canonicalSemaine(semaine: string | null | undefined): string {
  if (semaine == null || String(semaine).trim() === "") return "";
  const m = String(semaine).trim().match(/^S(\d+)$/i);
  if (!m) return String(semaine).trim();
  return `S${parseInt(m[1], 10)}`;
}
