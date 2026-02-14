import { useState, useEffect, useCallback } from "react";
import { Calendar, ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { api, type DailyReportResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Format YYYY-MM-DD → dd/mm/yyyy */
function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  const day = d!.replace(/^0/, "");
  const month = m!.replace(/^0/, "");
  return `${day}/${month}/${y}`;
}

/** Week of month (1–5): day 1–7 → S1, 8–14 → S2, etc. */
function weekOfMonth(iso: string): number {
  const d = new Date(iso + "T12:00:00");
  return Math.ceil(d.getDate() / 7);
}

function monthYear(iso: string): { month: number; year: number } {
  const d = new Date(iso + "T12:00:00");
  return { month: d.getMonth(), year: d.getFullYear() };
}

type DayItem = { type: "day"; date: string };
type WeekItem = { type: "week"; label: string; dates: string[] };

function buildOverviewItems(uniqueDates: string[]): (DayItem | WeekItem)[] {
  if (uniqueDates.length === 0) return [];
  const byWeek = new Map<string, string[]>();
  for (const date of uniqueDates) {
    const { month, year } = monthYear(date);
    const w = weekOfMonth(date);
    const key = `${year}-${month}-${w}`;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(date);
  }
  const items: (DayItem | WeekItem)[] = [];
  for (const [key, weekDates] of byWeek.entries()) {
    const sorted = [...weekDates].sort();
    if (sorted.length === 7) {
      const [first] = sorted;
      const { month, year } = monthYear(first!);
      const w = weekOfMonth(first!);
      const monthName = MOIS[month];
      items.push({
        type: "week",
        label: `S${w} de ${monthName} ${year}`,
        dates: sorted,
      });
    } else {
      for (const date of sorted) items.push({ type: "day", date });
    }
  }
  return items.sort((a, b) => {
    const dateA = a.type === "day" ? a.date : a.dates[0]!;
    const dateB = b.type === "day" ? b.date : b.dates[0]!;
    return dateB.localeCompare(dateA);
  });
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

  const toggleWeek = (label: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
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
              Cliquez sur un jour pour consulter ou modifier le rapport. Les semaines complètes (7 jours) sont regroupées.
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
              const isExpanded = expandedWeeks.has(item.label);
              return (
                <div key={item.label} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleWeek(item.label)}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-muted/40 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span>{item.label}</span>
                  </button>
                  {isExpanded && (
                    <div className="flex flex-wrap gap-2 pl-6">
                      {item.dates.map((date) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onSelectDay(date)}
                          className="px-3 py-2 rounded-md border border-border bg-background hover:bg-muted/60 text-sm text-foreground"
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
