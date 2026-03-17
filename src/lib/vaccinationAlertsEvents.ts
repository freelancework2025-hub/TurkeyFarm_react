/** Event name for triggering vaccination alerts banner refetch (e.g. after planning save). */
export const VACCINATION_ALERTS_REFRESH_EVENT = "vaccinationAlertsRefresh";

/** Dispatches a global event to refetch vaccination alerts. Call after saving planning or notes. */
export function dispatchVaccinationAlertsRefresh(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VACCINATION_ALERTS_REFRESH_EVENT));
  }
}
