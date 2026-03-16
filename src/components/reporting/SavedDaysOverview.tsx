import { useState, useEffect, useCallback } from "react";
import { Calendar, ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { api, type DailyReportResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

/** Format YYYY-MM-DD → dd/mm/yyyy */
function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  const day = d!.replace(/^0/, "");
  const month = m!.replace(/^0/, "");
  return `${day}/${month}/${y}`;
}

/** Date range for a week: "dd/mm – dd/mm/yyyy" (first day – last day) */
function formatWeekDateRange(dates: string[]): string {
  if (dates.length === 0) return "";
  const sorted = [...dates].sort();
  const first = formatDateDMY(sorted[0]!);
  const last = formatDateDMY(sorted[sorted.length - 1]!);
  if (first === last) return first;
  const [d1, m1, y1] = first.split("/");
  const [d2, m2, y2] = last.split("/");
  return `${d1}/${m1} – ${d2}/${m2}/${y2}`;
}

/** Add n days to ISO date (YYYY-MM-DD), return YYYY-MM-DD */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0]!;
}

type DayInWeek = { date: string; hasReport: boolean };
type DayItem = { type: "day"; date: string };
type WeekItem = { type: "week"; weekKey: string; label: string; dateRange: string; days: DayInWeek[] };

/**
 * Build week items with exactly 7 days each. S1 = ages 1–7, S2 = ages 8–14, etc.
 * Each week box shows all 7 days; days with reports are highlighted, others are "À faire".
 */
function buildOverviewItems(reports: DailyReportResponse[]): (DayItem | WeekItem)[] {
  const uniqueByDate = new Map<string, number>();
  for (const r of reports) {
    if (r.reportDate && !uniqueByDate.has(r.reportDate)) {
      uniqueByDate.set(r.reportDate, r.ageJour ?? 0);
    }
  }
  const datesWithAge = [...uniqueByDate.entries()];
  if (datesWithAge.length === 0) return [];

  const minReportDate = datesWithAge.reduce((min, [d]) => (d < min ? d : min), datesWithAge[0]![0]);
  const savedDates = new Set(uniqueByDate.keys());

  const bySemaine = new Map<number, string[]>();
  for (const [dateStr, ageJour] of datesWithAge) {
    const age = ageJour > 0 ? ageJour : (() => {
      const d = new Date(dateStr + "T12:00:00");
      const p = new Date(minReportDate + "T12:00:00");
      const diff = Math.floor((d.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, diff + 1);
    })();
    const semaine = Math.ceil(age / 7);
    const list = bySemaine.get(semaine) ?? [];
    list.push(dateStr);
    bySemaine.set(semaine, list);
  }

  const semaineNumbers = [...bySemaine.keys()].sort((a, b) => a - b);
  return semaineNumbers.map((sem) => {
    const placement = minReportDate;
    const days: DayInWeek[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(placement, (sem - 1) * 7 + i);
      days.push({ date, hasReport: savedDates.has(date) });
    }
    const dateStrings = days.map((d) => d.date);
    return {
      type: "week" as const,
      weekKey: `semaine-S${sem}-${days[0]!.date}`,
      label: `S${sem}`,
      dateRange: formatWeekDateRange(dateStrings),
      days,
    };
  });
}

interface SavedDaysOverviewProps {
  onSelectDay: (date: string) => void;
  onNewReport: () => void;
  /** When set (Admin/RT), list is scoped to this farm. */
  farmId?: number | null;
  /** When set, filter reports to show only those related to this lot. */
  lot?: string | null;
}

export default function SavedDaysOverview({ onSelectDay, onNewReport, farmId, lot }: SavedDaysOverviewProps) {
  const { toast } = useToast();
  const { canCreate } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<DailyReportResponse[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    console.log("📊 SavedDaysOverview - Loading daily reports with:", { farmId, lot });
    setLoading(true);
    try {
      const list: DailyReportResponse[] = await api.dailyReports.list(farmId ?? undefined, lot ?? undefined);
      console.log("✅ SavedDaysOverview - Daily reports loaded:", { count: list.length, list });
      setReports(list);
    } catch (error) {
      console.error("❌ SavedDaysOverview - Error loading daily reports:", error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des jours enregistrés…</span>
      </div>
    );
  }

  const items = buildOverviewItems(reports);

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">
              Jours enregistrés
            </h2>
            <p className="text-xs text-muted-foreground">
              Cliquez sur une semaine (S1, S2…) pour afficher les jours de la semaine, puis sur un jour pour ouvrir le rapport.
            </p>
          </div>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={onNewReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Nouveau rapport
          </button>
        )}
      </div>

      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {canCreate 
              ? "Aucun rapport enregistré pour cette ferme. Cliquez sur « Nouveau rapport » pour commencer."
              : "Aucun rapport enregistré pour cette ferme."
            }
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {items.map((item) => {
              if (item.type === "day") {
                return (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => onSelectDay(item.date)}
                    className="px-4 py-3 rounded-lg border border-border bg-background hover:bg-muted/60 text-sm font-medium text-foreground transition-colors"
                  >
                    {formatDateDMY(item.date)}
                  </button>
                );
              }
              const isExpanded = expandedWeeks.has(item.weekKey);
              return (
                <div key={item.weekKey} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleWeek(item.weekKey)}
                    className="flex flex-col items-start gap-0.5 px-4 py-3 rounded-lg border-2 border-border bg-muted/40 hover:bg-muted/60 hover:border-primary/50 text-left transition-colors min-w-[140px]"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.dateRange}</span>
                  </button>
                  {isExpanded && (
                    <div className="flex flex-wrap gap-2 pl-2">
                      {item.days.map(({ date, hasReport }) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onSelectDay(date)}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            hasReport
                              ? "border-border bg-background hover:bg-primary/10 hover:border-primary/50 text-foreground"
                              : "border-dashed border-muted-foreground/50 bg-muted/30 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground"
                          }`}
                          title={hasReport ? formatDateDMY(date) : `${formatDateDMY(date)} — À faire`}
                        >
                          {formatDateDMY(date)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
