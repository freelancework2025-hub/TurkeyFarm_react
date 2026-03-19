import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Bell, CalendarClock, Check, CalendarIcon, Clock } from "lucide-react";
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
import { api, type VaccinationAlertResponse } from "@/lib/api";
import { VACCINATION_ALERTS_REFRESH_EVENT } from "@/lib/vaccinationAlertsEvents";
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

  const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  const [rawH, rawM] = (rescheduleTime || "09:00").split(":");
  const timeHour = (rawH ?? "09").padStart(2, "0");
  const timeMinute = (rawM ?? "00").padStart(2, "0");
  const setTimeFromParts = (h: string, m: string) =>
    setRescheduleTime(`${h.padStart(2, "0")}:${m.padStart(2, "0")}`);

  const canConfirmOrReschedule = isResponsableFerme || canCreate;
  const count = loading ? 0 : alerts.length;
  const rescheduledAlerts = alerts.filter((a) => a.rescheduled === true);
  const regularAlerts = alerts.filter((a) => a.rescheduled !== true);
  const hasNewAlerts = regularAlerts.length > 0;
  const hasRescheduled = rescheduledAlerts.length > 0;
  const hasUnconfirmedAlerts = count > 0;
  const hasBoth = hasNewAlerts && hasRescheduled;
  const alertTheme = hasBoth ? "blend" : hasNewAlerts ? "red" : hasRescheduled ? "blue" : "amber";

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

  const handleConfirm = async (a: VaccinationAlertResponse) => {
    try {
      await api.vaccinationAlerts.confirm({ farmId: a.farmId, lot: a.lot, planningId: a.planningId });
      toast({ title: "Alert confirmée", description: "L'alerte a été marquée comme traitée." });
      setAlerts((prev) => prev.filter((x) => x.planningId !== a.planningId || x.lot !== a.lot));
    } catch {
      toast({ title: "Erreur", description: "Impossible de confirmer.", variant: "destructive" });
    }
  };

  const handleRescheduleOpen = (a: VaccinationAlertResponse) => {
    setRescheduleFor({ planningId: a.planningId, farmId: a.farmId, lot: a.lot });
    setDatePickerOpen(false);
    setTimePickerOpen(false);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setRescheduleDate(tomorrow.toISOString().split("T")[0]);
    setRescheduleTime("09:00");
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
      fetchAlerts();
    } catch {
      toast({ title: "Erreur", description: "Impossible de reporter.", variant: "destructive" });
    }
  };

  return (
    <>
      {/* Pro bell icon — fixed top-right on all pages, 50% compact (Magic UI BorderBeam when alerts) */}
      <div className="fixed top-4 right-4 md:right-6 z-50">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
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
          {hasUnconfirmedAlerts && (
            <BorderBeam
              size={40}
              duration={5}
              colorFrom={alertTheme === "blend" ? "#3b82f6" : alertTheme === "red" ? "#ef4444" : alertTheme === "blue" ? "#3b82f6" : "#d97706"}
              colorTo={alertTheme === "blend" ? "#ef4444" : alertTheme === "red" ? "#f87171" : alertTheme === "blue" ? "#60a5fa" : "#f59e0b"}
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
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); setRescheduleFor(null); setRescheduleTime("09:00"); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Rappels de vaccination
            </DialogTitle>
            <DialogDescription>
              Le lot atteindra l'âge prévu pour le vaccin demain. Planifiez l'administration.
              {canConfirmOrReschedule && " En tant que responsable de ferme : confirmez une fois réalisé ou reportez à une autre date. Si vous reportez, vous recevrez un email à la date choisie jusqu'à confirmation."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Aucune alerte vaccination en attente.</p>
            ) : (
              <div className="space-y-4">
                {/* Grey card: rescheduled alerts with brief info (read from DB) */}
                {rescheduledAlerts.length > 0 && (
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
            )}
          </div>

          {rescheduleFor && (
            <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-muted/50 to-muted/30 p-4 shadow-sm">
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
                  onClick={() => setRescheduleFor(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
