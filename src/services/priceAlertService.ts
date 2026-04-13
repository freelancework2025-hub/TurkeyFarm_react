/**
 * Price Alert Service
 * API service for managing price alerts (missing PRIX values)
 */

import { apiFetch, getStoredToken } from "@/lib/api";

export interface PriceAlertResponse {
  id: number;
  farmId: number;
  farmName: string;
  farmCode: string;
  entityType: string;
  pageName: string;
  ligneDescription: string;
  createdAt: string;
  createdBy: string;
  lotId: number | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export interface PriceAlertsPageResponse {
  content: PriceAlertResponse[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/**
 * Get active price alerts (paginated)
 * Returns alerts from ALL accessible farms (not filtered by selected farm)
 */
export async function getActiveAlerts(
  page: number = 0,
  size: number = 20,
  token?: string | null
): Promise<PriceAlertsPageResponse> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("size", String(size));
  
  return apiFetch<PriceAlertsPageResponse>(
    `/api/price-alerts?${params.toString()}`,
    { token: token ?? getStoredToken() }
  );
}

/**
 * Count active price alerts for badge
 * Returns count from ALL accessible farms (not filtered by selected farm)
 */
export async function countActiveAlerts(
  token?: string | null
): Promise<number> {
  return apiFetch<number>("/api/price-alerts/count", {
    token: token ?? getStoredToken(),
  });
}

/**
 * Confirm a price alert (only RT, Backoffice, and Admin)
 */
export async function confirmAlert(
  alertId: number,
  token?: string | null
): Promise<void> {
  return apiFetch<void>(`/api/price-alerts/${alertId}/confirm`, {
    method: "POST",
    token: token ?? getStoredToken(),
  });
}
