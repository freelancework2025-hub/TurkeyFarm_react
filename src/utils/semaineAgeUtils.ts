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
 */
export function computeAgeByRowId<T extends { id: string }>(
  rows: T[],
  getSem: (r: T) => string,
  getDate: (r: T) => string
): Map<string, number> {
  const semOrder = sortSemaines([...new Set(rows.map((r) => (getSem(r) || "").trim()).filter(Boolean))]);
  const ordered = [...rows].sort((a, b) => {
    const semA = (getSem(a) || "").trim();
    const semB = (getSem(b) || "").trim();
    const idxA = semOrder.indexOf(semA);
    const idxB = semOrder.indexOf(semB);
    if (idxA !== idxB) return idxA - idxB;
    return (getDate(a) || "").localeCompare(getDate(b) || "");
  });
  const ageById = new Map<string, number>();
  ordered.forEach((r, i) => ageById.set(r.id, i + 1));
  return ageById;
}
