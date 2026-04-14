import { useState, useEffect, useCallback } from "react";
import { DollarSign } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { countActiveAlerts } from "@/services/priceAlertService";
import { useAuth } from "@/contexts/AuthContext";
import PriceAlertList from "./PriceAlertList";

/**
 * Price Alert Icon Component
 * Displays a green dollar icon with badge count next to the notification bell
 * Visible to RT, Backoffice, and Administrateur (always shown, like vaccination alerts)
 * Shows count from ALL accessible farms (not filtered by selected farm)
 */
export default function PriceAlertIcon() {
  const { isResponsableTechnique, isBackofficeEmployer, isAdministrateur } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Show to RT, Backoffice, and Administrateur (always, regardless of farm selection)
  const canViewAlerts = isResponsableTechnique || isBackofficeEmployer || isAdministrateur;

  const fetchCount = useCallback(async () => {
    if (!canViewAlerts) return;
    
    try {
      // Get count from ALL accessible farms (no farmId parameter)
      const alertCount = await countActiveAlerts();
      setCount(alertCount);
    } catch (error) {
      console.error("Failed to fetch price alert count:", error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [canViewAlerts]);

  // Initial fetch
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Poll every 30 seconds
  useEffect(() => {
    if (!canViewAlerts) return;

    const interval = setInterval(() => {
      fetchCount();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchCount, canViewAlerts]);

  // Listen for custom event to refresh count immediately
  useEffect(() => {
    if (!canViewAlerts) return;

    const handlePriceAlertChanged = () => {
      fetchCount();
    };

    window.addEventListener('priceAlertChanged', handlePriceAlertChanged);

    return () => {
      window.removeEventListener('priceAlertChanged', handlePriceAlertChanged);
    };
  }, [fetchCount, canViewAlerts]);

  // Refresh count when dialog closes
  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      fetchCount();
    }
  };

  if (!canViewAlerts || loading) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className={`
          relative flex items-center gap-1 rounded-lg border bg-card/95 backdrop-blur-sm px-2 py-1.5 sm:px-1.5 sm:py-1 shadow
          transition-all hover:shadow-md hover:scale-[1.02] active:scale-95
          ${count > 0
            ? "border-green-300 dark:border-green-700"
            : "border-gray-200 dark:border-gray-700"
          }
        `}
        role="status"
        aria-label={`Alertes prix : ${count} alerte${count !== 1 ? "s" : ""} en attente`}
        title={count === 0 ? "Aucune alerte prix" : `${count} alerte${count > 1 ? "s" : ""} prix manquant — Cliquez pour voir`}
      >
        {count > 0 && (
          <BorderBeam
            size={40}
            duration={5}
            colorFrom="#22c55e"
            colorTo="#86efac"
            borderWidth={1}
            className="rounded-lg"
          />
        )}
        <div
          className={`
            flex h-6 w-6 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-full
            ${count > 0
              ? "bg-green-100 dark:bg-green-900/50"
              : "bg-gray-100 dark:bg-gray-800/50"
            }
          `}
        >
          <DollarSign
            className={`h-3.5 w-3.5 sm:h-2.5 sm:w-2.5 ${
              count > 0
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          />
        </div>
        <span
          className={`
            flex min-w-[1.25rem] sm:min-w-[1rem] items-center justify-center rounded-full px-1.5 py-0.5 sm:px-1 sm:py-px text-sm sm:text-xs font-bold tabular-nums text-white
            ${count > 0
              ? "bg-green-500 dark:bg-green-600"
              : "bg-gray-400 dark:bg-gray-600"
            }
            ${count > 0 ? "animate-alert-flash" : ""}
          `}
        >
          {count}
        </span>
      </button>

      <PriceAlertList open={dialogOpen} onOpenChange={handleDialogChange} />
    </>
  );
}
