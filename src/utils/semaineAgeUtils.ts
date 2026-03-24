/**
 * Shared utilities for SEM (semaine label S1, S2, ...) and AGE (sequential day 1, 2, 3...).
 * SEM = the specific semaine (S1, S2, S3...).
 * AGE = auto-incremented from 1 across all semaines for a lot; when adding a new semaine, continues from previous.
 */

/** Sort semaines: S1, S2, ... Sn by numeric suffix (any n >= 1). */
export function sortSemaines(sems: string[]): string[] {
  return [...sems].sort((a, b) => {
    const numA = parseInt(a.replace(/^S(\d+)$/i, "$1"), 10);
    const numB = parseInt(b.replace(/^S(\d+)$/i, "$1"), 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    if (!Number.isNaN(numA)) return -1;
    if (!Number.isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Theoretical first-day offset for a semaine label (before chaining with previous weeks).
 * Sn -> (n-1)*7; empty SEM -> maxN*7 from other labels (same as "week after last Sn"); unknown -> undefined (use chain only).
 */
function formulaBaseForSemaine(sem: string, allTrimmedLabels: string[]): number | undefined {
  if (!sem) {
    const nonempty = [...new Set(allTrimmedLabels.filter(Boolean))];
    const maxN = Math.max(
      0,
      ...nonempty.map((s) => {
        const m = s.toUpperCase().match(/^S(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
    );
    return maxN > 0 ? maxN * 7 : 0;
  }
  const m = sem.toUpperCase().match(/^S(\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1) return (n - 1) * 7;
  }
  return undefined;
}

/**
 * Compute AGE (sequential 1, 2, 3...) for each row.
 * Rows are ordered by (semaine order, date). Per semaine, draft ages fill base+1, base+2, ...
 * where base = max(formula offset for that label, max age already assigned in earlier semaines).
 * So a manually added Sn (or a week with extra rows) continues after the previous week's ages, never restarting at 1.
 *
 * Rows with empty SEM sort with other non-Sn labels via sortSemaines.
 * Optional getStoredAge breaks ties when two rows share the same sem + date (matches DB order after reload).
 */
export function computeAgeByRowId<T extends { id: string }>(
  rows: T[],
  getSem: (r: T) => string,
  getDate: (r: T) => string,
  getStoredAge?: (r: T) => number | undefined
): Map<string, number> {
  const ageById = new Map<string, number>();

  const trimmedSems = rows.map((r) => (getSem(r) || "").trim());
  const uniqueSems = sortSemaines([...new Set(trimmedSems)]);

  let globalMaxAge = 0;

  for (const sem of uniqueSems) {
    const formula = formulaBaseForSemaine(sem, trimmedSems);
    const baseAge =
      formula !== undefined ? Math.max(formula, globalMaxAge) : Math.max(globalMaxAge, 0);

    const semRows = rows.filter((r) => (getSem(r) || "").trim() === sem);
    semRows.sort((a, b) => {
      const dc = (getDate(a) || "").localeCompare(getDate(b) || "");
      if (dc !== 0) return dc;
      const sa = getStoredAge?.(a);
      const sb = getStoredAge?.(b);
      if (sa != null && sb != null && sa !== sb) return sa - sb;
      return 0;
    });

    const usedAges = new Set<number>();
    const withoutStored: T[] = [];

    semRows.forEach((r) => {
      const sa = getStoredAge?.(r);
      if (sa != null) {
        usedAges.add(sa);
        ageById.set(r.id, sa);
      } else {
        withoutStored.push(r);
      }
    });

    const availableAges: number[] = [];
    const maxAgeToGenerate = baseAge + semRows.length + 10;
    for (let i = 1; i <= maxAgeToGenerate; i++) {
        const potentialAge = baseAge + i;
        if (!usedAges.has(potentialAge)) {
            availableAges.push(potentialAge);
        }
    }

    withoutStored.forEach((r, idx) => {
      if (idx < availableAges.length) {
         ageById.set(r.id, availableAges[idx]);
      } else {
         // Fallback if more rows than anticipated
         ageById.set(r.id, availableAges[availableAges.length - 1] + (idx - availableAges.length + 1));
      }
    });

    let semPeak = globalMaxAge;
    for (const r of semRows) {
      const a = ageById.get(r.id);
      if (a != null) semPeak = Math.max(semPeak, a);
    }
    globalMaxAge = semPeak;
  }

  return ageById;
}
