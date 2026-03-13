/**
 * Daily Metrics Card — Displays daily report metrics for Responsable Ferme and Backoffice.
 * Shows data from the latest saved day of the selected lot.
 * Designed with MagicUI components for a beautiful, modern UI.
 */

import { useMemo, type ReactNode } from "react";
import { MagicCard } from "@/components/ui/magic-card";
import { 
  Activity, 
  Droplet, 
  ThermometerSnowflake, 
  ThermometerSun,
  Pill,
  TrendingDown,
  CalendarDays,
  Hash,
  Bird
} from "lucide-react";
import type { DailyDashboardSummary, DailySexMetrics } from "@/lib/api";

/** Empty sex metrics for Mâle/Femelle when no data — ensures cards always show */
const EMPTY_SEX_METRICS: DailySexMetrics = {
  sex: "",
  mortalityCount: 0,
  waterConsumption: 0,
  tempMin: null,
  tempMax: null,
  traitement: null,
};

interface DailyMetricsCardProps {
  data: DailyDashboardSummary;
  contentBelowMortality?: ReactNode;
}

export function DailyMetricsCard({ data, contentBelowMortality }: DailyMetricsCardProps) {
  const { reportDate, ageJour, semaine, lot, sexMetrics, totalMortality, effectifInitialByBuildingSex } = data;

  const maleMetrics = useMemo(
    () => sexMetrics.find((m) => m.sex.toLowerCase().includes("mâle") || m.sex.toLowerCase().includes("male")) ?? { ...EMPTY_SEX_METRICS, sex: "Mâle" },
    [sexMetrics]
  );
  
  const femaleMetrics = useMemo(
    () => sexMetrics.find((m) => m.sex.toLowerCase().includes("femelle") || m.sex.toLowerCase().includes("female")) ?? { ...EMPTY_SEX_METRICS, sex: "Femelle" },
    [sexMetrics]
  );

  const effectifList = effectifInitialByBuildingSex ?? [];
  const totalMaleEffectif = useMemo(
    () => effectifList
      .filter((e) => e.sex === "Mâle" || e.sex?.toLowerCase().includes("male"))
      .reduce((sum, e) => sum + (e.effectifInitial ?? 0), 0),
    [effectifList]
  );
  const totalFemaleEffectif = useMemo(
    () => effectifList
      .filter((e) => e.sex === "Femelle" || e.sex?.toLowerCase().includes("femelle"))
      .reduce((sum, e) => sum + (e.effectifInitial ?? 0), 0),
    [effectifList]
  );

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr.trim() === "") return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num == null) return "-";
    return num.toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Date du rapport</p>
              <p className="text-lg font-semibold text-foreground">{formatDate(reportDate)}</p>
            </div>
          </div>
        </MagicCard>

        {lot != null && lot !== "" && (
          <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300 delay-75">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Hash className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Dernier lot</p>
                <p className="text-lg font-semibold text-foreground">{lot}</p>
              </div>
            </div>
          </MagicCard>
        )}

        <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300 delay-75">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Âge (jours)</p>
              <p className="text-lg font-semibold text-foreground">{ageJour ?? "-"}</p>
            </div>
          </div>
        </MagicCard>

        <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300 delay-150">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Semaine</p>
              <p className="text-lg font-semibold text-foreground">S{semaine ?? "-"}</p>
            </div>
          </div>
        </MagicCard>
      </div>

      {/* Total Mortality */}
      <MagicCard className="rounded-xl border-2 border-border bg-gradient-to-br from-red-500/5 via-card to-card p-6 animate-in fade-in duration-300 delay-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <TrendingDown className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Mortalité totale du jour</p>
              <p className="text-3xl font-bold text-foreground">{totalMortality}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-foreground">Total des deux sexes</p>
          </div>
        </div>
      </MagicCard>

      {contentBelowMortality}

      {/* Effectif initial (Effectif Mis en Place) — always shown, empty when no data */}
      <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300 delay-225">
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400">
              <Bird className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Effectif initial (Effectif Mis en Place)</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-foreground">Bâtiment</th>
                  <th className="text-left py-2 px-3 font-medium text-foreground">Sexe</th>
                  <th className="text-right py-2 px-3 font-medium text-foreground">Effectif initial</th>
                </tr>
              </thead>
              <tbody>
                {effectifList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      Aucune donnée
                    </td>
                  </tr>
                ) : (
                  effectifList.map((row, idx) => (
                    <tr key={`${row.building}-${row.sex}-${idx}`} className="border-b border-border/50">
                      <td className="py-2 px-3 font-medium text-foreground">{row.building}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.sex === "Mâle" || row.sex?.toLowerCase().includes("male")
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                        }`}>
                          {row.sex}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-foreground">
                        {(row.effectifInitial ?? 0).toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-medium">
                  <td colSpan={2} className="py-2 px-3 text-right text-foreground">
                    Total Mâle / Femelle :
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-foreground">
                    {totalMaleEffectif.toLocaleString("fr-FR")} / {totalFemaleEffectif.toLocaleString("fr-FR")}
                  </td>
                </tr>
                <tr className="bg-muted/40 font-medium">
                  <td colSpan={2} className="py-2 px-3 text-right text-foreground">
                    Total général :
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-foreground">
                    {(totalMaleEffectif + totalFemaleEffectif).toLocaleString("fr-FR")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </MagicCard>

      {/* Male and Female Metrics — always shown, empty values when no data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Male Metrics */}
        <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300 delay-300">
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 font-semibold">
                M
              </div>
              <h3 className="text-lg font-semibold text-foreground">Mâle</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-foreground">Mortalité (NBR)</span>
                </div>
                <span className="text-lg font-semibold text-foreground">{maleMetrics.mortalityCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-foreground">Conso. Eau (L)</span>
                </div>
                <span className="text-lg font-semibold text-foreground">{formatNumber(maleMetrics.waterConsumption)}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <ThermometerSnowflake className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm font-medium text-foreground">Temp. Min (°C)</span>
                </div>
                <span className="text-lg font-semibold text-foreground">{formatNumber(maleMetrics.tempMin)}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <ThermometerSun className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-foreground">Temp. Max (°C)</span>
                </div>
                <span className="text-lg font-semibold text-foreground">{formatNumber(maleMetrics.tempMax)}</span>
              </div>

              {maleMetrics.traitement && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Pill className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-foreground">Traitement</span>
                  </div>
                  <p className="text-sm text-foreground">{maleMetrics.traitement}</p>
                </div>
              )}
            </div>
          </div>
        </MagicCard>

        {/* Female Metrics */}
        <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300 delay-350">
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-600/10 text-pink-600 font-semibold">
                  F
                </div>
                <h3 className="text-lg font-semibold text-foreground">Femelle</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-foreground">Mortalité (NBR)</span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">{femaleMetrics.mortalityCount}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-foreground">Conso. Eau (L)</span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">{formatNumber(femaleMetrics.waterConsumption)}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ThermometerSnowflake className="h-4 w-4 text-cyan-500" />
                    <span className="text-sm font-medium text-foreground">Temp. Min (°C)</span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">{formatNumber(femaleMetrics.tempMin)}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ThermometerSun className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-foreground">Temp. Max (°C)</span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">{formatNumber(femaleMetrics.tempMax)}</span>
                </div>

                {femaleMetrics.traitement && (
                  <div className="p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Pill className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium text-foreground">Traitement</span>
                    </div>
                    <p className="text-sm text-foreground">{femaleMetrics.traitement}</p>
                  </div>
                )}
              </div>
            </div>
          </MagicCard>
      </div>
    </div>
  );
}
