import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { DollarSign, Check, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  getActiveAlerts,
  confirmAlert,
  type PriceAlertResponse,
} from "@/services/priceAlertService";

interface PriceAlertListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Price Alert List Component
 * Modal/drawer to display all active price alerts
 * Shows: page name, ligne description, created date, created by
 * Confirmation button (only for RT and Backoffice)
 */
export default function PriceAlertList({ open, onOpenChange }: PriceAlertListProps) {
  const { isResponsableTechnique, isBackofficeEmployer, isAdministrateur } = useAuth();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<PriceAlertResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Sequential thinking state for handling many alerts
  const [sequentialThinking, setSequentialThinking] = useState(false);
  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);
  const [processedAlerts, setProcessedAlerts] = useState<Set<number>>(new Set());
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // RT, Backoffice, and Admin can confirm alerts
  const canConfirm = isResponsableTechnique || isBackofficeEmployer || isAdministrateur;

  // Sequential thinking logic
  const hasManyAlerts = totalElements > 1; // Activate from 2 alerts
  const shouldUseSequentialThinking = hasManyAlerts && !showAllAlerts;
  const currentAlert = shouldUseSequentialThinking ? alerts[currentAlertIndex] : null;
  const remainingAlerts = shouldUseSequentialThinking ? alerts.length - currentAlertIndex - 1 : 0;

  // Auto-start sequential thinking when there are many alerts
  useEffect(() => {
    if (hasManyAlerts && !sequentialThinking && !showAllAlerts && alerts.length > 0) {
      setSequentialThinking(true);
      setCurrentAlertIndex(0);
      setProcessedAlerts(new Set());
    }
  }, [hasManyAlerts, sequentialThinking, showAllAlerts, alerts.length]);

  const fetchAlerts = useCallback(async (pageNum: number = 0) => {
    setLoading(true);
    try {
      // Get alerts from ALL accessible farms (no farmId parameter)
      const response = await getActiveAlerts(pageNum, 20);
      setAlerts(response.content);
      setTotalPages(response.totalPages);
      setTotalElements(response.totalElements);
      setPage(response.number);
    } catch (error) {
      console.error("Failed to fetch price alerts:", error);
      setAlerts([]);
      toast({
        title: "Erreur",
        description: "Impossible de charger les alertes prix.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      fetchAlerts(0);
    }
  }, [open, fetchAlerts]);

  const handleConfirm = async (alertId: number) => {
    try {
      // Confirm alert (no farmId parameter needed)
      await confirmAlert(alertId);
      toast({
        title: "Alerte confirmée",
        description: "L'alerte a été marquée comme traitée.",
      });
      
      // Mark as processed in sequential thinking mode
      if (shouldUseSequentialThinking && currentAlert && alertId === currentAlert.id) {
        setProcessedAlerts(prev => new Set([...prev, alertId]));
        handleNextAlert();
      }
      
      // Refresh the list
      fetchAlerts(page);
      
      // Dispatch custom event to refresh the counter immediately
      window.dispatchEvent(new CustomEvent('priceAlertChanged'));
    } catch (error) {
      console.error("Failed to confirm alert:", error);
      toast({
        title: "Erreur",
        description: "Impossible de confirmer l'alerte.",
        variant: "destructive",
      });
    }
  };

  const handleNextAlert = () => {
    if (currentAlertIndex < alerts.length - 1) {
      setCurrentAlertIndex(prev => prev + 1);
    } else {
      // All alerts processed, show summary
      setSequentialThinking(false);
      setShowAllAlerts(true);
      toast({
        title: "Traitement terminé",
        description: `Toutes les alertes ont été traitées. ${processedAlerts.size} alertes ont été confirmées.`,
      });
    }
  };

  const handlePreviousAlert = () => {
    if (currentAlertIndex > 0) {
      setCurrentAlertIndex(prev => prev - 1);
    }
  };

  const exitSequentialThinking = () => {
    setSequentialThinking(false);
    setShowAllAlerts(true);
    setCurrentAlertIndex(0);
    setProcessedAlerts(new Set());
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy à HH:mm", { locale: fr });
    } catch {
      return dateString;
    }
  };

  const handleNextPage = () => {
    if (page < totalPages - 1) {
      fetchAlerts(page + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 0) {
      fetchAlerts(page - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) {
        // Reset sequential thinking state when dialog closes
        setSequentialThinking(false);
        setShowAllAlerts(false);
        setCurrentAlertIndex(0);
        setProcessedAlerts(new Set());
      }
    }}>
      <DialogContent className="w-[95vw] max-w-4xl h-[95vh] sm:h-[90vh] flex flex-col mx-auto">
        <DialogHeader className="flex-shrink-0 px-1">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
            Alertes Prix Manquants
          </DialogTitle>
          {sequentialThinking ? (
            <div className="space-y-2">
              <DialogDescription className="text-sm">
                Mode séquentiel activé - Traitement alerte par alerte
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                <span>Alerte {currentAlertIndex + 1} sur {totalElements}</span>
                <span className="hidden sm:inline">•</span>
                <span>{remainingAlerts} restantes</span>
                <span className="hidden sm:inline">•</span>
                <span>{processedAlerts.size} traitées</span>
              </div>
            </div>
          ) : (
            <DialogDescription className="text-sm">
              {totalElements === 0
                ? "Aucune alerte prix en attente."
                : `${totalElements} alerte${totalElements > 1 ? "s" : ""} en attente de confirmation`}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-center text-muted-foreground">Chargement...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-muted-foreground">
                Aucune alerte prix en attente.
                <br />
                <span className="text-sm">Tous les prix ont été renseignés.</span>
              </p>
            </div>
          ) : shouldUseSequentialThinking && currentAlert ? (
            // Sequential thinking mode - show one alert at a time
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
                <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30 overflow-hidden">
                  <div className="px-3 sm:px-4 py-2 font-semibold flex items-center gap-2 text-green-900 dark:text-green-100 bg-green-100/50 dark:bg-green-900/30">
                    <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm sm:text-base">
                      {currentAlert.farmName} — {currentAlert.pageName}
                    </span>
                  </div>

                  <div className="px-3 sm:px-4 py-3 space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground font-medium">Ligne :</span>
                      <br />
                      <span className="break-words">{currentAlert.ligneDescription}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground font-medium">Ferme :</span>
                        <br />
                        <span className="break-words">{currentAlert.farmName} ({currentAlert.farmCode})</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Type :</span>
                        <br />
                        <span className="break-words">{currentAlert.entityType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Créé le :</span>
                        <br />
                        <span className="break-words">{formatDate(currentAlert.createdAt)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Créé par :</span>
                        <br />
                        <span className="break-words">{currentAlert.createdBy}</span>
                      </div>
                    </div>

                    {canConfirm && (
                      <div className="pt-2 border-t border-green-200 dark:border-green-800">
                        <Button
                          size="sm"
                          onClick={() => handleConfirm(currentAlert.id)}
                          className="gap-1 w-full sm:w-auto bg-green-600 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4" />
                          Confirmer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sequential navigation */}
              <div className="flex-shrink-0 border-t p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/30">
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePreviousAlert}
                    disabled={currentAlertIndex === 0}
                    className="gap-1 flex-1 sm:flex-none"
                  >
                    <ChevronUp className="h-4 w-4" />
                    Précédente
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleNextAlert}
                    disabled={currentAlertIndex === alerts.length - 1}
                    className="gap-1 flex-1 sm:flex-none"
                  >
                    Suivante
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={exitSequentialThinking}
                  className="text-muted-foreground hover:text-foreground w-full sm:w-auto text-xs sm:text-sm"
                >
                  Voir toutes les alertes
                </Button>
              </div>
            </div>
          ) : (
            // Regular mode - show all alerts
            <div className="h-full overflow-y-auto overflow-x-hidden p-2 sm:p-4 space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30 overflow-hidden"
                >
                  <div className="px-3 sm:px-4 py-2 font-semibold flex items-center gap-2 text-green-900 dark:text-green-100 bg-green-100/50 dark:bg-green-900/30">
                    <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm sm:text-base">
                      {alert.farmName} — {alert.pageName}
                    </span>
                  </div>

                  <div className="px-3 sm:px-4 py-3 space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground font-medium">Ligne :</span>
                      <br />
                      <span className="break-words">{alert.ligneDescription}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground font-medium">Ferme :</span>
                        <br />
                        <span className="break-words">{alert.farmName} ({alert.farmCode})</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Type :</span>
                        <br />
                        <span className="break-words">{alert.entityType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Créé le :</span>
                        <br />
                        <span className="break-words">{formatDate(alert.createdAt)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Créé par :</span>
                        <br />
                        <span className="break-words">{alert.createdBy}</span>
                      </div>
                    </div>

                    {canConfirm && (
                      <div className="pt-2 border-t border-green-200 dark:border-green-800">
                        <Button
                          size="sm"
                          onClick={() => handleConfirm(alert.id)}
                          className="gap-1 w-full sm:w-auto bg-green-600 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4" />
                          Confirmer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 border-t p-3 sm:p-4 flex items-center justify-between gap-3 bg-muted/30">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrevPage}
              disabled={page === 0}
            >
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} sur {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleNextPage}
              disabled={page >= totalPages - 1}
            >
              Suivant
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
