import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Bell, CalendarClock, Check, CalendarIcon, Clock, Brain, ChevronDown, ChevronUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AnimatedList } from "@/components/ui/animated-list";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { api, type VaccinationAlertResponse } from "@/lib/api";
import { VACCINATION_ALERTS_REFRESH_EVENT } from "@/lib/vaccinationAlertsEvents";
import { initAlertSound, unlockAndPlayVaccinationAlertSound, playVaccinationAlertSound } from "@/lib/alertSound";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/** Format YYYY-MM-DD to dd/mm/yyyy */
function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function orDash(v: string | null | undefined): string {
  return v && v.trim() ? v : "—";
}

export default function VaccinationAlertsBanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedFarmId, canAccessAllFarms, isResponsableFerme, canCreate } = useAuth();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<VaccinationAlertResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rescheduleFor, setRescheduleFor] = useState<{ planningId: number; farmId: number; lot: string } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  /** Brief Magic UI BorderBeam after silent audio unlock when there are no pending alerts (no beep on first click). */
  const [silentAudioReadyCue, setSilentAudioReadyCue] = useState(false);
  
  // Sequential thinking state for handling many alerts
  const [sequentialThinking, setSequentialThinking] = useState(false);
  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);
  const [processedAlerts, setProcessedAlerts] = useState<Set<number>>(new Set());
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [separateRescheduleModal, setSeparateRescheduleModal] = useState(false);
  
  const alertsRef = useRef<VaccinationAlertResponse[]>([]);
  const loadingRef = useRef(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  const [rawH, rawM] = (rescheduleTime || "09:00").split(":");
  const timeHour = (rawH ?? "09").padStart(2, "0");
  const timeMinute = (rawM ?? "00").padStart(2, "0");
  const setTimeFromParts = (h: string, m: string) =>
    setRescheduleTime(`${h.padStart(2, "0")}:${m.padStart(2, "0")}`);

  const canConfirmOrReschedule = isResponsableFerme || canCreate;
  /** Keep badge/count during refetch (e.g. after reschedule) so the banner does not flash to zero while the list is still valid. */
  const count = alerts.length;
  const rescheduledAlerts = alerts.filter((a) => a.rescheduled === true);
  const regularAlerts = alerts.filter((a) => a.rescheduled !== true);
  const hasNewAlerts = regularAlerts.length > 0;
  const hasRescheduled = rescheduledAlerts.length > 0;
  const hasUnconfirmedAlerts = count > 0;
  const hasBoth = hasNewAlerts && hasRescheduled;
  const alertTheme = hasBoth ? "blend" : hasNewAlerts ? "red" : hasRescheduled ? "blue" : "amber";
  
  // Sequential thinking logic
  const hasManyAlerts = count > 10;
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

  const fetchAlerts = useCallback(() => {
    setLoading(true);
    api.vaccinationAlerts
      .list({ farmId: canAccessAllFarms ? selectedFarmId ?? undefined : undefined })
      .then((res) => {
        setAlerts(res?.alerts ?? []);
      })
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [selectedFarmId, canAccessAllFarms]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.vaccinationAlerts
      .list({ farmId: canAccessAllFarms ? selectedFarmId ?? undefined : undefined })
      .then((res) => {
        if (!cancelled) setAlerts(res?.alerts ?? []);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFarmId, canAccessAllFarms, dialogOpen]);

  useEffect(() => {
    const handler = () => fetchAlerts();
    window.addEventListener(VACCINATION_ALERTS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(VACCINATION_ALERTS_REFRESH_EVENT, handler);
  }, [fetchAlerts]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    initAlertSound(() => {
      if (loadingRef.current || alertsRef.current.length > 0) return;
      setSilentAudioReadyCue(true);
      window.setTimeout(() => setSilentAudioReadyCue(false), 2200);
    });
  }, []);

  /**
   * Reminder sound every 5 minutes while the server still has pending alerts:
   * same rules as the bell list (computed from planning + lot age + reports / mise en place;
   * confirmed alerts drop out; rescheduled to a future date disappear until that date).
   * Runs once immediately when the farm context is ready, then on the interval (after audio unlock via user gesture).
   */
  useEffect(() => {
    const FIVE_MIN_MS = 5 * 60 * 1000;
    const checkAndPlay = () => {
      api.vaccinationAlerts
        .pending({ farmId: canAccessAllFarms ? selectedFarmId ?? undefined : undefined })
        .then((res) => {
          if (res?.pending === true) {
            playVaccinationAlertSound();
          }
        })
        .catch(() => {});
    };
    checkAndPlay();
    const id = window.setInterval(checkAndPlay, FIVE_MIN_MS);
    return () => window.clearInterval(id);
  }, [selectedFarmId, canAccessAllFarms]);

  // Deep-link from email: ?openVaccinationAlerts=1 opens the dialog
  useEffect(() => {
    if (searchParams.get("openVaccinationAlerts") === "1") {
      setDialogOpen(true);
      // Clear param from URL to avoid re-opening on refresh
      const next = new URLSearchParams(searchParams);
      next.delete("openVaccinationAlerts");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams]);

  const handleRescheduleOpen = (a: VaccinationAlertResponse) => {
    setRescheduleFor({ planningId: a.planningId, farmId: a.farmId, lot: a.lot });
    setDatePickerOpen(false);
    setTimePickerOpen(false);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleDate(tomorrow.toISOString().split("T")[0]);
    setRescheduleTime("09:00");
    
    // Use separate modal for reschedule when there are many alerts
    if (hasManyAlerts) {
      setSeparateRescheduleModal(true);
    }
  };

  /** Format "HH:mm" to "XhYY" for display */
  const formatTimeDisplay = (t: string | null | undefined) =>
    t && t.trim() ? t.replace(":", "h") : "00h00";

  const handleRescheduleSubmit = async () => {
    if (!rescheduleFor || !rescheduleDate) return;
    const timeStr = (rescheduleTime || "09:00").trim();
    try {
      await api.vaccinationAlerts.reschedule({
        farmId: rescheduleFor.farmId,
        lot: rescheduleFor.lot,
        planningId: rescheduleFor.planningId,
        rescheduleDate,
        rescheduleTime: timeStr,
      });
      toast({
        title: "Reporté",
        description: `L'alerte sera réaffichée le ${formatDate(rescheduleDate)} à ${formatTimeDisplay(timeStr)} (Casablanca). Vous recevrez un rappel par email à cette heure jusqu'à confirmation.`,
      });
      setRescheduleFor(null);
      setSeparateRescheduleModal(false);
      
      // Mark as processed in sequential thinking mode
      if (shouldUseSequentialThinking && currentAlert) {
        setProcessedAlerts(prev => new Set([...prev, currentAlert.planningId]));
        handleNextAlert();
      }
      
      fetchAlerts();
    } catch {
      toast({ title: "Erreur", description: "Impossible de reporter.", variant: "destructive" });
    }
  };

  const handleConfirm = async (a: VaccinationAlertResponse) => {
    try {
      await api.vaccinationAlerts.confirm({ farmId: a.farmId, lot: a.lot, planningId: a.planningId });
      toast({ title: "Alert confirmée", description: "L'alerte a été marquée comme traitée." });
      
      // Mark as processed in sequential thinking mode
      if (shouldUseSequentialThinking && currentAlert && a.planningId === currentAlert.planningId) {
        setProcessedAlerts(prev => new Set([...prev, a.planningId]));
        handleNextAlert();
      }
      
      fetchAlerts();
    } catch {
      toast({ title: "Erreur", description: "Impossible de confirmer.", variant: "destructive" });
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
        description: `Toutes les alertes ont été traitées. ${processedAlerts.size} alertes ont été confirmées ou reportées.`,
      });
    }
  };

  const handlePreviousAlert = () => {
    if (currentAlertIndex > 0) {
      setCurrentAlertIndex(prev => prev - 1);
    }
  };

  const startSequentialThinking = () => {
    setSequentialThinking(true);
    setCurrentAlertIndex(0);
    setProcessedAlerts(new Set());
    setShowAllAlerts(false);
  };

  const exitSequentialThinking = () => {
    setSequentialThinking(false);
    setShowAllAlerts(true);
    setCurrentAlertIndex(0);
    setProcessedAlerts(new Set());
  };

  return (
    <>
      {/* Pro bell icon — fixed top-right on all pages, 50% compact (Magic UI BorderBeam when alerts) */}
      <div className="fixed top-4 right-4 md:right-6 z-50">
        <button
          type="button"
          onClick={() => {
            if (hasUnconfirmedAlerts) unlockAndPlayVaccinationAlertSound();
            setDialogOpen(true);
          }}
          className={`
            relative flex items-center gap-1 rounded-lg border bg-card/95 backdrop-blur-sm px-1.5 py-1 shadow
            transition-all hover:shadow-md hover:scale-[1.02]
            ${alertTheme === "blend"
              ? "border-blue-400/60 dark:border-red-400/60"
              : alertTheme === "red"
                ? "border-red-300 dark:border-red-700"
                : alertTheme === "blue"
                  ? "border-blue-300 dark:border-blue-700"
                  : "border-amber-200 dark:border-amber-800"
            }
          `}
          role="status"
          aria-label={`Rappels vaccination : ${count} alerte${count !== 1 ? "s" : ""} en attente`}
          title={count === 0 ? "Aucune alerte vaccination" : `${count} alerte${count > 1 ? "s" : ""} à prévoir — Cliquez pour voir`}
        >
          {(hasUnconfirmedAlerts || silentAudioReadyCue) && (
            <BorderBeam
              size={40}
              duration={hasUnconfirmedAlerts ? 5 : 7}
              colorFrom={
                hasUnconfirmedAlerts
                  ? alertTheme === "blend"
                    ? "#3b82f6"
                    : alertTheme === "red"
                      ? "#ef4444"
                      : alertTheme === "blue"
                        ? "#3b82f6"
                        : "#d97706"
                  : "#22d3ee"
              }
              colorTo={
                hasUnconfirmedAlerts
                  ? alertTheme === "blend"
                    ? "#ef4444"
                    : alertTheme === "red"
                      ? "#f87171"
                      : alertTheme === "blue"
                        ? "#60a5fa"
                        : "#f59e0b"
                  : "#34d399"
              }
              borderWidth={1}
              className="rounded-lg"
            />
          )}
          <div
            className={`
              flex h-5 w-5 shrink-0 items-center justify-center rounded-full
              ${alertTheme === "blend"
                ? "bg-gradient-to-br from-blue-100 to-red-100 dark:from-blue-900/50 dark:to-red-900/50"
                : alertTheme === "red"
                  ? "bg-red-100 dark:bg-red-900/50"
                  : alertTheme === "blue"
                    ? "bg-blue-100 dark:bg-blue-900/50"
                    : "bg-amber-100 dark:bg-amber-900/50"
              }
            `}
          >
            <Bell
              className={`h-2.5 w-2.5 ${
                alertTheme === "blend"
                  ? "text-violet-600 dark:text-violet-400"
                  : alertTheme === "red"
                    ? "text-red-600 dark:text-red-400"
                    : alertTheme === "blue"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-amber-600 dark:text-amber-400"
              }`}
            />
          </div>
          <span
            className={`
              flex min-w-[1rem] items-center justify-center rounded-full px-1 py-px text-xs font-bold tabular-nums text-white
              ${alertTheme === "blend"
                ? "bg-gradient-to-r from-blue-500 to-red-500 dark:from-blue-600 dark:to-red-600"
                : alertTheme === "red"
                  ? "bg-red-500 dark:bg-red-600"
                  : alertTheme === "blue"
                    ? "bg-blue-500 dark:bg-blue-600"
                    : "bg-amber-500 dark:bg-amber-600"
              }
              ${hasUnconfirmedAlerts ? "animate-alert-flash" : ""}
            `}
          >
            {count}
          </span>
        </button>
      </div>

      {/* Popup dialog with full details */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { 
        setDialogOpen(o); 
        setRescheduleFor(null); 
        setRescheduleTime("09:00");
        if (!o) {
          // Reset sequential thinking state when dialog closes
          setSequentialThinking(false);
          setShowAllAlerts(false);
          setCurrentAlertIndex(0);
          setProcessedAlerts(new Set());
        }
      }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Rappels de vaccination
            </DialogTitle>
            {sequentialThinking ? (
              <div className="space-y-2">
                <DialogDescription>
                  Mode séquentiel activé - Traitement alerte par alerte
                </DialogDescription>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Alerte {currentAlertIndex + 1} sur {count}</span>
                  <span>•</span>
                  <span>{remainingAlerts} restantes</span>
                  <span>•</span>
                  <span>{processedAlerts.size} traitées</span>
                </div>
              </div>
            ) : null}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            {alerts.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-center text-muted-foreground">Aucune alerte vaccination en attente.</p>
              </div>
            ) : shouldUseSequentialThinking && currentAlert ? (
              // Sequential thinking mode - show one alert at a time
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 overflow-hidden">
                    <div className="px-4 py-2 font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-100 bg-amber-100/50 dark:bg-amber-900/30">
                      {currentAlert.farmName} — Lot {currentAlert.lot} • Âge actuel : {currentAlert.currentAge} J → Vaccin prévu à {currentAlert.vaccineAgeLabel}
                    </div>

                    <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                      <div><span className="text-muted-foreground">Age</span><br />{currentAlert.vaccineAgeLabel}</div>
                      <div><span className="text-muted-foreground">Date</span><br />{formatDate(currentAlert.planDate ?? null)}</div>
                      <div><span className="text-muted-foreground">Motif</span><br />{orDash(currentAlert.motif)}</div>
                      <div><span className="text-muted-foreground">Vaccin / Traitement</span><br />{orDash(currentAlert.vaccinTraitement)}</div>
                      <div><span className="text-muted-foreground">Quantité</span><br />{orDash(currentAlert.quantite)}</div>
                      <div><span className="text-muted-foreground">Administration</span><br />{orDash(currentAlert.administration)}</div>
                      <div className="sm:col-span-2"><span className="text-muted-foreground">Remarques</span><br />{orDash(currentAlert.remarques)}</div>
                    </div>

                    {currentAlert.notes && currentAlert.notes.length > 0 && (
                      <div className="px-4 py-2 border-t border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-medium mb-1 text-amber-800 dark:text-amber-200">Notes :</p>
                        <ul className="list-disc list-inside text-sm space-y-0.5 text-amber-700 dark:text-amber-300">
                          {currentAlert.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {canConfirmOrReschedule && (
                      <div className="px-4 py-3 flex gap-2 border-t border-amber-200 dark:border-amber-800">
                        <Button size="sm" variant="outline" onClick={() => handleRescheduleOpen(currentAlert)} className="gap-1">
                          <CalendarClock className="h-4 w-4" />
                          Reporter
                        </Button>
                        <Button size="sm" onClick={() => handleConfirm(currentAlert)} className="gap-1 bg-green-600 hover:bg-green-700">
                          <Check className="h-4 w-4" />
                          Confirmer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sequential navigation */}
                <div className="flex-shrink-0 border-t p-4 flex items-center justify-between bg-muted/30">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePreviousAlert}
                      disabled={currentAlertIndex === 0}
                      className="gap-1"
                    >
                      <ChevronUp className="h-4 w-4" />
                      Précédente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleNextAlert}
                      disabled={currentAlertIndex === alerts.length - 1}
                      className="gap-1"
                    >
                      Suivante
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={exitSequentialThinking}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Voir toutes les alertes
                  </Button>
                </div>
              </div>
            ) : (
              // Regular mode - show all alerts with proper scrolling
              <div className="h-full w-full relative">
                <div 
                  ref={scrollContainerRef} 
                  className="h-full w-full overflow-y-auto overflow-x-hidden"
                  style={{ 
                    scrollBehavior: 'smooth',
                    WebkitOverflowScrolling: 'touch',
                    maxHeight: '100%'
                  }}
                >
                  <div className="p-4 space-y-4" style={{ paddingBottom: '2rem' }}>
                    {/* Grey card: rescheduled alerts with brief info (read from DB) */}
                    {rescheduledAlerts.length > 0 && (
                      <BlurFade delay={0.1}>
                        <div className="rounded-lg border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/40 overflow-hidden">
                          <div className="px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 bg-gray-100/80 dark:bg-gray-800/50 flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-gray-500" />
                            Alertes reportées
                          </div>
                          <div className="px-4 py-3 space-y-2">
                            {rescheduledAlerts.map((a, idx) => (
                              <div
                                key={`resched-${a.farmId}-${a.lot}-${a.planningId}-${idx}`}
                                className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-300"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium">
                                    {a.farmName} — Lot {a.lot} • Âge actuel : {a.currentAge} J → Vaccin prévu à {a.vaccineAgeLabel}
                                  </span>
                                  {a.planDate && (
                                    <span className="text-xs text-muted-foreground">
                                      Réaffichée le {formatDate(a.planDate)}
                                      {a.rescheduleTime ? ` à ${formatTimeDisplay(a.rescheduleTime)} (Casablanca)` : ""}
                                    </span>
                                  )}
                                </div>
                                {canConfirmOrReschedule && (
                                  <div className="flex gap-1.5 shrink-0">
                                    <Button size="sm" variant="outline" onClick={() => handleRescheduleOpen(a)} className="gap-1 h-7 text-xs">
                                      <CalendarClock className="h-3 w-3" />
                                      Reporter
                                    </Button>
                                    <Button size="sm" onClick={() => handleConfirm(a)} className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700">
                                      <Check className="h-3 w-3" />
                                      Confirmer
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </BlurFade>
                    )}

                    {/* Regular alerts (day-before, first-day) */}
                    {regularAlerts.length > 0 && (
                      <AnimatedList delay={250} className="gap-4 w-full">
                        {regularAlerts.map((a, idx) => (
                          <div
                            key={`${a.farmId}-${a.lot}-${a.planningId}-${idx}`}
                            className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 overflow-hidden"
                          >
                            <div className="px-4 py-2 font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-100 bg-amber-100/50 dark:bg-amber-900/30">
                              {a.farmName} — Lot {a.lot} • Âge actuel : {a.currentAge} J → Vaccin prévu à {a.vaccineAgeLabel}
                            </div>

                            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                              <div><span className="text-muted-foreground">Age</span><br />{a.vaccineAgeLabel}</div>
                              <div><span className="text-muted-foreground">Date</span><br />{formatDate(a.planDate ?? null)}</div>
                              <div><span className="text-muted-foreground">Motif</span><br />{orDash(a.motif)}</div>
                              <div><span className="text-muted-foreground">Vaccin / Traitement</span><br />{orDash(a.vaccinTraitement)}</div>
                              <div><span className="text-muted-foreground">Quantité</span><br />{orDash(a.quantite)}</div>
                              <div><span className="text-muted-foreground">Administration</span><br />{orDash(a.administration)}</div>
                              <div className="sm:col-span-2"><span className="text-muted-foreground">Remarques</span><br />{orDash(a.remarques)}</div>
                            </div>

                            {a.notes && a.notes.length > 0 && (
                              <div className="px-4 py-2 border-t border-amber-200 dark:border-amber-800">
                                <p className="text-xs font-medium mb-1 text-amber-800 dark:text-amber-200">Notes :</p>
                                <ul className="list-disc list-inside text-sm space-y-0.5 text-amber-700 dark:text-amber-300">
                                  {a.notes.map((n, i) => (
                                    <li key={i}>{n}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {canConfirmOrReschedule && (
                              <div className="px-4 py-2 flex gap-2 border-t border-amber-200 dark:border-amber-800">
                                <Button size="sm" variant="outline" onClick={() => handleRescheduleOpen(a)} className="gap-1">
                                  <CalendarClock className="h-4 w-4" />
                                  Reporter
                                </Button>
                                <Button size="sm" onClick={() => handleConfirm(a)} className="gap-1 bg-green-600 hover:bg-green-700">
                                  <Check className="h-4 w-4" />
                                  Confirmer
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </AnimatedList>
                    )}
                  </div>
                </div>

                {/* Progressive blur for better scroll indication when there are many alerts */}
                {hasManyAlerts && (
                  <ProgressiveBlur
                    className="pointer-events-none"
                    height="10%"
                    position="bottom"
                  />
                )}
              </div>
            )}
          </div>

          {/* Inline reschedule section - only show when not using separate modal */}
          {rescheduleFor && !separateRescheduleModal && (
            <div className="flex-shrink-0 relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-muted/50 to-muted/30 p-4 shadow-sm">
              <BorderBeam
                size={60}
                duration={8}
                colorFrom="#8b5cf6"
                colorTo="#06b6d4"
                borderWidth={1}
                className="rounded-xl"
              />
              <div className="relative flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-foreground/90">
                  Date et heure (Casablanca GMT+1) :
                </span>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="min-w-[160px] justify-start gap-2 border-input/80 bg-background/95 font-normal hover:bg-accent/50 hover:border-primary/30"
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" />
                      {rescheduleDate
                        ? format(new Date(rescheduleDate + "T12:00:00"), "dd/MM/yyyy", { locale: fr })
                        : "Choisir une date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden rounded-xl border-border/80 bg-gradient-to-br from-popover to-popover/95 p-0 shadow-lg" align="start">
                    <Calendar
                      mode="single"
                      selected={rescheduleDate ? new Date(rescheduleDate + "T12:00:00") : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setRescheduleDate(format(date, "yyyy-MM-dd"));
                          setDatePickerOpen(false);
                        }
                      }}
                      locale={fr}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover open={timePickerOpen} onOpenChange={setTimePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="min-w-[120px] justify-start gap-2 border-input/80 bg-background/95 font-mono font-semibold tabular-nums hover:bg-accent/50 hover:border-primary/30"
                    >
                      <Clock className="h-4 w-4 shrink-0 opacity-70" />
                      {rescheduleTime || "09:00"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden rounded-xl border-border/80 bg-gradient-to-br from-popover to-popover/95 p-4 shadow-lg" align="start">
                    <BlurFade inView={false} delay={0} duration={0.25} offset={4} blur="4px">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heures</span>
                          <Select
                            value={timeHour}
                            onValueChange={(v) => setTimeFromParts(v, timeMinute)}
                          >
                            <SelectTrigger className="h-10 w-[80px] border-primary/20 font-mono text-base font-semibold tabular-nums transition-colors hover:border-primary/40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[220px]">
                              {HOURS.map((h) => (
                                <SelectItem key={h} value={h} className="font-mono tabular-nums">
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="mt-7 text-2xl font-bold tabular-nums text-muted-foreground/80">:</span>
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Minutes</span>
                          <Select
                            value={timeMinute}
                            onValueChange={(v) => setTimeFromParts(timeHour, v)}
                          >
                            <SelectTrigger className="h-10 w-[80px] border-primary/20 font-mono text-base font-semibold tabular-nums transition-colors hover:border-primary/40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[220px]">
                              {MINUTES.map((m) => (
                                <SelectItem key={m} value={m} className="font-mono tabular-nums">
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </BlurFade>
                  </PopoverContent>
                </Popover>
                <ShimmerButton
                  onClick={handleRescheduleSubmit}
                  className="shrink-0 px-5 py-2 text-sm font-semibold"
                  background="hsl(var(--primary))"
                  shimmerColor="rgba(255,255,255,0.4)"
                >
                  Valider
                </ShimmerButton>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRescheduleFor(null);
                    setDatePickerOpen(false);
                    setTimePickerOpen(false);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          <div className="flex-shrink-0 flex justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Separate reschedule modal for better UX when there are many alerts */}
      <Dialog open={separateRescheduleModal} onOpenChange={(open) => {
        setSeparateRescheduleModal(open);
        if (!open) {
          setRescheduleFor(null);
          setDatePickerOpen(false);
          setTimePickerOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-500" />
              Reporter l'alerte
            </DialogTitle>
            <DialogDescription>
              Choisissez une nouvelle date et heure pour cette alerte de vaccination.
              Vous recevrez un rappel par email jusqu'à confirmation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" />
                    {rescheduleDate
                      ? format(new Date(rescheduleDate + "T12:00:00"), "dd/MM/yyyy", { locale: fr })
                      : "Choisir une date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={rescheduleDate ? new Date(rescheduleDate + "T12:00:00") : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setRescheduleDate(format(date, "yyyy-MM-dd"));
                        setDatePickerOpen(false);
                      }
                    }}
                    locale={fr}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Heure (Casablanca GMT+1)</label>
              <div className="flex items-center gap-2">
                <Select
                  value={timeHour}
                  onValueChange={(v) => setTimeFromParts(v, timeMinute)}
                >
                  <SelectTrigger className="w-20 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={h} className="font-mono">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-lg font-bold">:</span>
                <Select
                  value={timeMinute}
                  onValueChange={(v) => setTimeFromParts(timeHour, v)}
                >
                  <SelectTrigger className="w-20 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {MINUTES.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSeparateRescheduleModal(false);
                setRescheduleFor(null);
                setDatePickerOpen(false);
                setTimePickerOpen(false);
              }}
            >
              Annuler
            </Button>
            <ShimmerButton
              onClick={handleRescheduleSubmit}
              disabled={!rescheduleDate}
              className="px-6"
              background="hsl(var(--primary))"
              shimmerColor="rgba(255,255,255,0.4)"
            >
              Valider
            </ShimmerButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
