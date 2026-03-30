import type { LotWithStatusResponse } from "@/lib/api";

export type ClosedLotSessionContext = {
  currentUserId?: number | null;
  isAdministrateur: boolean;
  isResponsableTechnique: boolean;
};

/**
 * Closed lots: RF / back-office / other RT cannot read.
 * ADMIN: always. RT: only if they closed the lot (closedByUserId matches).
 * Legacy rows (closed, closedByUserId null): only ADMIN.
 */
export function canReadClosedLot(
  closed: boolean,
  closedByUserId: number | null | undefined,
  ctx: ClosedLotSessionContext
): boolean {
  if (!closed) return true;
  if (ctx.isAdministrateur) return true;
  if (
    ctx.isResponsableTechnique &&
    ctx.currentUserId != null &&
    closedByUserId != null &&
    closedByUserId === ctx.currentUserId
  ) {
    return true;
  }
  return false;
}

export function isClosedLotBlockedForSession(
  row: Pick<LotWithStatusResponse, "closed" | "closedByUserId"> | undefined,
  ctx: ClosedLotSessionContext
): boolean {
  if (!row?.closed) return false;
  return !canReadClosedLot(true, row.closedByUserId, ctx);
}
