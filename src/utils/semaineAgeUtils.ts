/**
 * Shared utilities for SEM (semaine label S1, S2, ...) and AGE (sequential day 1, 2, 3...).
 * SEM = the specific semaine (S1, S2, S3...).
 * AGE = auto-incremented from 1 across all semaines for a lot; when adding a new semaine, continues from previous.
 */

/** Sort semaines: S1, S2, ... S24, S25, S26, ... (incrementation continues after S24). */
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
 * Compute AGE (sequential 1, 2, 3...) for each row.
 * Rows are ordered by (semaine order, date). AGE = index + 1.
 * Incrementation spans S1 → S24 and continues after S24 (S25, S26, ...) without reset.
 *
 * Rows with empty SEM sort *after* all labelled semaines (fixes refresh bugs where indexOf("") was -1).
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
  const uniqueSems = [...new Set(trimmedSems)];

  for (const sem of uniqueSems) {
    let baseAge = 0;
    if (sem) {
      const semNumMatch = sem.toUpperCase().match(/^S(\d+)$/);
      if (semNumMatch) {
         const n = parseInt(semNumMatch[1], 10);
         if (n >= 1) {
           baseAge = (n - 1) * 7;
         }
      }
    } else {
      // For empty semaine, continue from the max semantic week * 7
      const allSems = [...new Set(trimmedSems.filter(Boolean))];
      const maxN = Math.max(0, ...allSems.map(s => {
          const m = s.toUpperCase().match(/^S(\d+)$/);
          return m ? parseInt(m[1], 10) : 0;
      }));
      baseAge = maxN * 7;
    }

    const semRows = rows.filter((r) => (getSem(r) || "").trim() === sem);
    semRows.sort((a, b) => {
      const dc = (getDate(a) || "").localeCompare(getDate(b) || "");
      if (dc !== 0) return dc;
      const sa = getStoredAge?.(a);
      const sb = getStoredAge?.(b);
      if (sa != null && sb != null && sa !== sb) return sa - sb;
      return 0;
    });

    semRows.forEach((r, i) => {
      ageById.set(r.id, baseAge + i + 1);
    });
  }

  return ageById;
}
