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

type DayItem = { type: "day"; date: string };
type WeekItem = { type: "week"; weekKey: string; label: string; dateRange: string; dates: string[] };

/**
 * Group saved days into semaine boxes: each consecutive block of 7 days (newest first) becomes S1, S2, etc.
 */
function buildOverviewItems(uniqueDates: string[]): (DayItem | WeekItem)[] {
  if (uniqueDates.length === 0) return [];
  const sorted = [...uniqueDates].sort((a, b) => b.localeCompare(a));
  const items: (DayItem | WeekItem)[] = [];
  let semaineIndex = 0;
  for (let i = 0; i < sorted.length; i += 7) {
    const chunk = sorted.slice(i, i + 7);
    if (chunk.length === 7) {
      semaineIndex += 1;
      const weekKey = `semaine-${semaineIndex}-${chunk[0]}`;
      items.push({
        type: "week",
        weekKey,
        label: `S${semaineIndex}`,
        dateRange: formatWeekDateRange(chunk),
        dates: [...chunk].sort(),
      });
    } else {
      for (const date of chunk) items.push({ type: "day", date });
    }
  }
  return items;
}

interface SavedDaysOverviewProps {
  onSelectDay: (date: string) => void;
  onNewReport: () => void;
  /** When set (Admin/RT), list is scoped to this farm. */
  farmId?: number | null;
}

export default function SavedDaysOverview({ onSelectDay, onNewReport, farmId }: SavedDaysOverviewProps) {
  const { toast } = useToast();
  const { canCreate } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list: DailyReportResponse[] = await api.dailyReports.list(farmId ?? undefined);
      const unique = Array.from(new Set(list.map((r) => r.reportDate)));
      setDates(unique);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les jours enregistrés.",
        variant: "destructive",
      });
      setDates([]);
    } finally {
      setLoading(false);
    }
  }, [toast, farmId]);

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

  const items = buildOverviewItems(dates);

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
              Cliquez sur une semaine (S1, S2…) pour afficher les 7 jours, puis sur un jour pour ouvrir le rapport.
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
                      {item.dates.map((date) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onSelectDay(date)}
                          className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-primary/10 hover:border-primary/50 text-sm font-medium text-foreground transition-colors"
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
