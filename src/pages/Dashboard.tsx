/**
 * Tableau de bord — Single unified dashboard with real KPIs from database.
 * 
 * Role-based views:
 * - RESPONSABLE_TECHNIQUE & ADMINISTRATEUR: See weekly aggregated metrics (existing view)
 * - RESPONSABLE_FERME & BACKOFFICE_EMPLOYER: See daily metrics from the latest saved day
 * 
 * Data sources:
 * - Weekly: suiviCoutHebdo.getResumeSummary, suiviConsommationHebdo.getResumeSummary, suiviTechniqueHebdo.list
 * - Daily: dailyReports.getDashboardSummary
 * 
 * Farm-specific data isolation: Responsable Ferme sees only their farm.
 */

import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  DashboardFilterBar,
  KPICard,
  WaterConsumptionLineChart,
  MortalityLineChart,
  DailyMetricsCard,
} from "@/components/dashboard";
import type {
  DashboardFilters,
  DailyWaterDataPoint,
  DailyMortalityDataPoint,
} from "@/components/dashboard";
import {
  Bird,
  Scale,
  HeartPulse,
  Wheat,
  DollarSign,
  Building2,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { api, type DailyDashboardSummary } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { MagicCard } from "@/components/ui/magic-card";

const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

export default function Dashboard() {
  const { 
    canAccessAllFarms, 
    isResponsableFerme, 
    selectedFarmId, 
    selectedFarm,
    isResponsableTechnique,
    isAdministrateur,
    isBackofficeEmployer,
  } = useAuth();

  // Determine which dashboard view to show
  // Weekly view: RT and Admin
  // Daily view: Responsable Ferme and Backoffice
  const showWeeklyDashboard = isResponsableTechnique || isAdministrateur;
  const showDailyDashboard = isResponsableFerme || isBackofficeEmployer;

  const [filters, setFilters] = useState<DashboardFilters>(() => ({
    farmId: isResponsableFerme ? selectedFarmId : null,
    lot: null,
    week: null,
    sex: null,
  }));
  const [farms, setFarms] = useState<{ id: number; name: string; code: string }[]>([]);
  const [lots, setLots] = useState<string[]>([]);

  const showFarmSelector = canAccessAllFarms;
  const fixedFarmId = isResponsableFerme ? selectedFarmId : null;
  const effectiveFarmId =
    filters.farmId ?? (isResponsableFerme ? selectedFarmId : null);
  const hasFarmContext = !!effectiveFarmId;

  // For daily dashboard (Responsable Ferme & Backoffice): always show last day of last lot.
  // When backoffice has no farm selected, use first farm so data loads immediately.
  const effectiveFarmIdForDaily =
    effectiveFarmId ?? (showDailyDashboard && farms.length > 0 ? farms[0]?.id ?? null : null);
  
  // Weekly dashboard requires farm + lot + week
  const canFetchWeeklyData = showWeeklyDashboard && hasFarmContext && !!filters.lot && !!filters.week;
  
  // Daily dashboard requires only farm (lot is auto-determined: last day of last lot)
  const canFetchDailyData = showDailyDashboard && !!effectiveFarmIdForDaily;
  
  // Legacy for backwards compatibility
  const canFetchData = canFetchWeeklyData;
  
  // Only Responsable Technique and Administrateur can see pricing information
  const canSeePricing = isResponsableTechnique || isAdministrateur;

  // Daily dashboard state
  const [dailySummary, setDailySummary] = useState<DailyDashboardSummary | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  useEffect(() => {
    if (canAccessAllFarms) {
      api.farms.list().then((data) => setFarms(data)).catch(() => setFarms([]));
    } else if (isResponsableFerme && selectedFarm) {
      setFarms([selectedFarm]);
    } else {
      setFarms([]);
    }
  }, [canAccessAllFarms, isResponsableFerme, selectedFarm]);

  useEffect(() => {
    if (effectiveFarmId) {
      api.farms.lots(effectiveFarmId).then((data) => setLots(data)).catch(() => setLots([]));
    } else {
      setLots([]);
    }
  }, [effectiveFarmId]);

  useEffect(() => {
    if (isResponsableFerme && selectedFarmId && filters.farmId !== selectedFarmId) {
      setFilters((f) => ({ ...f, farmId: selectedFarmId }));
    }
  }, [isResponsableFerme, selectedFarmId]);

  // Fetch real data from APIs
  const [costsSummary, setCostsSummary] = useState<
    Awaited<ReturnType<typeof api.suiviCoutHebdo.getResumeSummary>> | null
  >(null);
  const [consoSummary, setConsoSummary] = useState<
    Awaited<ReturnType<typeof api.suiviConsommationHebdo.getResumeSummary>> | null
  >(null);
  const [hebdoList, setHebdoList] = useState<
    Awaited<ReturnType<typeof api.suiviTechniqueHebdo.list>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Mean INDICE DE CONSOMMATION RÉEL across bâtiments, by sex (weekly dashboard). */
  const [indiceMeanBySex, setIndiceMeanBySex] = useState<{ male: number | null; female: number | null } | null>(null);
  /** Mean INDICE DE CONSOMMATION RÉEL across bâtiments, by sex (daily dashboard — Responsable Ferme). */
  const [dailyIndiceMeanBySex, setDailyIndiceMeanBySex] = useState<{ male: number | null; female: number | null } | null>(null);

  useEffect(() => {
    if (!canFetchData || !effectiveFarmId || !filters.lot || !filters.week) {
      setCostsSummary(null);
      setConsoSummary(null);
      setHebdoList([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const batimentsStr = DEFAULT_BATIMENTS.join(",");

    const hebdoMalePromise = api.suiviTechniqueHebdo.list({
      farmId: effectiveFarmId,
      lot: filters.lot,
      sex: "Mâle",
      semaine: filters.week,
    });
    const hebdoFemellePromise = api.suiviTechniqueHebdo.list({
      farmId: effectiveFarmId,
      lot: filters.lot,
      sex: "Femelle",
      semaine: filters.week,
    });

    Promise.all([
      api.suiviCoutHebdo.getResumeSummary({
        farmId: effectiveFarmId,
        lot: filters.lot,
        semaine: filters.week,
        batiments: batimentsStr,
      }),
      api.suiviConsommationHebdo.getResumeSummary({
        farmId: effectiveFarmId,
        lot: filters.lot,
        semaine: filters.week,
        batiments: DEFAULT_BATIMENTS,
      }),
      Promise.all([hebdoMalePromise, hebdoFemellePromise]).then(([male, femelle]) =>
        [...(male ?? []), ...(femelle ?? [])]
      ),
    ])
      .then(([costs, conso, hebdo]) => {
        setCostsSummary(costs);
        setConsoSummary(conso);
        setHebdoList(hebdo ?? []);
      })
      .catch((err) => {
        setError(err?.message ?? "Erreur lors du chargement des données.");
        setCostsSummary(null);
        setConsoSummary(null);
        setHebdoList([]);
      })
      .finally(() => setLoading(false));
  }, [
    canFetchData,
    effectiveFarmId,
    filters.lot,
    filters.week,
  ]);

  // Fetch mean INDICE DE CONSOMMATION RÉEL by sex (one value per sex = average over bâtiments)
  useEffect(() => {
    if (!canFetchWeeklyData || !effectiveFarmId || !filters.lot || !filters.week) {
      setIndiceMeanBySex(null);
      return;
    }
    const sexes = ["Mâle", "Femelle"] as const;
    const promises: Array<{ sex: string; batiment: string }> = [];
    for (const sex of sexes) {
      for (const batiment of DEFAULT_BATIMENTS) {
        promises.push({ sex, batiment });
      }
    }
    Promise.all(
      promises.map(({ sex, batiment }) =>
        api.suiviPerformancesHebdo
          .get({
            farmId: effectiveFarmId,
            lot: filters.lot!,
            semaine: filters.week!,
            sex,
            batiment,
          })
          .then((res) => ({ sex, value: res.indiceConsommationReel ?? null }))
          .catch(() => ({ sex, value: null }))
      )
    ).then((results) => {
      const maleValues = results.filter((r) => r.sex === "Mâle" && r.value != null).map((r) => r.value as number);
      const femaleValues = results.filter((r) => r.sex === "Femelle" && r.value != null).map((r) => r.value as number);
      const mean = (arr: number[]) =>
        arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
      setIndiceMeanBySex({
        male: mean(maleValues),
        female: mean(femaleValues),
      });
    });
  }, [canFetchWeeklyData, effectiveFarmId, filters.lot, filters.week]);

  // Fetch daily dashboard data (lot = null → backend returns last day of last lot)
  useEffect(() => {
    if (!canFetchDailyData || !effectiveFarmIdForDaily) {
      setDailySummary(null);
      setDailyLoading(false);
      return;
    }

    setDailyLoading(true);
    setDailyError(null);

    api.dailyReports
      .getDashboardSummary(effectiveFarmIdForDaily, null) // null = last day of last lot
      .then((data) => {
        setDailySummary(data);
      })
      .catch((err) => {
        setDailyError(err?.message ?? "Erreur lors du chargement des données journalières.");
        setDailySummary(null);
      })
      .finally(() => setDailyLoading(false));
  }, [canFetchDailyData, effectiveFarmIdForDaily]);

  // Fetch mean INDICE DE CONSOMMATION RÉEL by sex for daily dashboard (lot + semaine from last day)
  useEffect(() => {
    if (!showDailyDashboard || !effectiveFarmIdForDaily || !dailySummary?.lot || !dailySummary?.semaine) {
      setDailyIndiceMeanBySex(null);
      return;
    }
    const lot = dailySummary.lot;
    const s = dailySummary.semaine;
    const semaine = s != null ? (typeof s === "number" ? `S${s}` : String(s).startsWith("S") ? String(s) : `S${s}`) : "";
    if (!semaine) {
      setDailyIndiceMeanBySex(null);
      return;
    }
    const sexes = ["Mâle", "Femelle"] as const;
    const promises: Array<{ sex: string; batiment: string }> = [];
    for (const sex of sexes) {
      for (const batiment of DEFAULT_BATIMENTS) {
        promises.push({ sex, batiment });
      }
    }
    Promise.all(
      promises.map(({ sex, batiment }) =>
        api.suiviPerformancesHebdo
          .get({
            farmId: effectiveFarmIdForDaily,
            lot,
            semaine,
            sex,
            batiment,
          })
          .then((res) => ({ sex, value: res.indiceConsommationReel ?? null }))
          .catch(() => ({ sex, value: null }))
      )
    ).then((results) => {
      const maleValues = results.filter((r) => r.sex === "Mâle" && r.value != null).map((r) => r.value as number);
      const femaleValues = results.filter((r) => r.sex === "Femelle" && r.value != null).map((r) => r.value as number);
      const mean = (arr: number[]) =>
        arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
      setDailyIndiceMeanBySex({
        male: mean(maleValues),
        female: mean(femaleValues),
      });
    });
  }, [showDailyDashboard, effectiveFarmIdForDaily, dailySummary?.lot, dailySummary?.semaine]);

  const { totalMortality, effectifDepart, mortalityPct } = useMemo(() => {
    if (!hebdoList.length) {
      return { totalMortality: 0, effectifDepart: 0, mortalityPct: null as number | null };
    }

    const byDate = new Map<string, { mortalite: number; effectif: number }>();
    for (const r of hebdoList) {
      if (!r.recordDate) continue;
      const existing = byDate.get(r.recordDate) ?? { mortalite: 0, effectif: 0 };
      existing.mortalite += r.mortaliteNbre ?? 0;
      if (r.effectifDepart != null) existing.effectif += r.effectifDepart;
      byDate.set(r.recordDate, existing);
    }

    const sortedDates = Array.from(byDate.keys()).sort();
    const firstDay = sortedDates[0];
    const first = firstDay ? byDate.get(firstDay) : null;
    const effectifDepart = first?.effectif ?? 0;
    const totalMortality = Array.from(byDate.values()).reduce((s, x) => s + x.mortalite, 0);
    const mortalityPct =
      effectifDepart > 0 ? (totalMortality / effectifDepart) * 100 : null;
    return { totalMortality, effectifDepart, mortalityPct };
  }, [hebdoList]);

  const consoAlimentKg = consoSummary?.consoAlimentSemaineSum != null
    ? Number(consoSummary.consoAlimentSemaineSum)
    : null;

  const dailyWaterData = useMemo((): DailyWaterDataPoint[] => {
    if (!hebdoList.length) return [];
    const byDate = new Map<string, number>();
    for (const r of hebdoList) {
      if (!r.recordDate) continue;
      const prev = byDate.get(r.recordDate) ?? 0;
      byDate.set(r.recordDate, prev + (r.consoEauL ?? 0));
    }
    const DAY_ABBREV = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([recordDate, consoEauL]) => {
        const [y, m, d] = recordDate.split("-").map(Number);
        const dateObj = new Date(y, (m ?? 1) - 1, d ?? 1);
        const dayAbbrev = DAY_ABBREV[dateObj.getDay()] ?? "";
        const dayNum = String(d ?? 0).padStart(2, "0");
        return { date: recordDate, dayLabel: `${dayAbbrev} ${dayNum}`, consoEauL };
      });
  }, [hebdoList]);

  const dailyMortalityData = useMemo((): DailyMortalityDataPoint[] => {
    if (!hebdoList.length) return [];
    const byDate = new Map<string, number>();
    for (const r of hebdoList) {
      if (!r.recordDate) continue;
      const prev = byDate.get(r.recordDate) ?? 0;
      byDate.set(r.recordDate, prev + (r.mortaliteNbre ?? 0));
    }
    const DAY_ABBREV = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([recordDate, mortaliteNbre]) => {
        const [y, m, d] = recordDate.split("-").map(Number);
        const dateObj = new Date(y, (m ?? 1) - 1, d ?? 1);
        const dayAbbrev = DAY_ABBREV[dateObj.getDay()] ?? "";
        const dayNum = String(d ?? 0).padStart(2, "0");
        return { date: recordDate, dayLabel: `${dayAbbrev} ${dayNum}`, mortaliteNbre };
      });
  }, [hebdoList]);

  return (
    <AppLayout>
      <div className="relative min-h-screen">
        {/* Subtle background */}
        <div
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.03]"
          aria-hidden
        >
          <svg className="h-full w-full">
            <defs>
              <pattern
                id="dashboard-grid"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dashboard-grid)" />
          </svg>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
              Tableau de bord
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {showWeeklyDashboard
                ? "Suivi des indicateurs hebdomadaires - Production, mortalité, consommation et coûts"
                : "Dernier jour enregistré (dernier lot) — métriques quotidiennes"}
            </p>
          </div>

          {/* Only show filter bar for weekly dashboard users */}
          {showWeeklyDashboard && (
            <DashboardFilterBar
              filters={filters}
              onFiltersChange={setFilters}
              farms={farms}
              lots={lots}
              showFarmSelector={showFarmSelector}
              fixedFarmId={fixedFarmId}
            />
          )}

          {showFarmSelector && !hasFarmContext && !(showDailyDashboard && effectiveFarmIdForDaily) && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 py-16 animate-in fade-in duration-300">
                <Building2 className="h-16 w-16 text-muted-foreground" />
                <h2 className="mt-4 text-xl font-display font-semibold text-foreground">
                  Choisissez une ferme
                </h2>
                <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                  {showWeeklyDashboard
                    ? "Sélectionnez une ferme, un lot et une semaine pour afficher les métriques."
                    : "Sélectionnez une ferme pour afficher les métriques quotidiennes."}
                </p>
              </div>
          )}

          {/* Weekly Dashboard View (RT & Admin) */}
          {showWeeklyDashboard && (
            <>
              {hasFarmContext && !canFetchWeeklyData && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 py-16 animate-in fade-in duration-300">
                    <ClipboardList className="h-16 w-16 text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-display font-semibold text-foreground">
                      Lot et semaine requis
                    </h2>
                    <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                      Sélectionnez un lot et une semaine, puis cliquez sur Appliquer pour charger les données.
                    </p>
                  </div>
              )}

              {loading && canFetchWeeklyData && (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Chargement des données…</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                  {error}
                </div>
              )}

              {!loading && canFetchWeeklyData && !error && costsSummary != null && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                      <KPICard
                        label="Total oiseaux produits"
                          value={costsSummary.totalNbreProduction ?? 0}
                          icon={Bird}
                          animateValue
                        />
                      </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Mortalité cumulative"
                          value={
                            mortalityPct != null
                              ? `${mortalityPct.toFixed(2)}%`
                              : totalMortality > 0
                              ? `${totalMortality} (sans %)`
                              : "-"
                          }
                          icon={HeartPulse}
                          status={
                            mortalityPct != null
                              ? mortalityPct > 3
                                ? "danger"
                                : "success"
                              : "neutral"
                          }
                        />
                      </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Consommation aliment"
                          value={
                            consoAlimentKg != null
                              ? consoAlimentKg.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 1,
                                })
                              : "-"
                          }
                          unit="kg/sem"
                          icon={Wheat}
                        />
                      </MagicCard>
                  </div>

                  {/* Moyenne INDICE DE CONSOMMATION RÉEL par sexe (moyenne entre les bâtiments). Nécessite: suivi consommation + poids vif produit (stock) pour la semaine. */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div title={indiceMeanBySex?.male == null ? "Calcul = Cumul aliment consommé / Poids vif produit. Saisir les données de consommation et le poids moyen réel (performances) pour afficher l'indice." : undefined}>
                      <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Moy. INDICE DE CONSOMMATION RÉEL — Mâle"
                          value={indiceMeanBySex?.male != null ? Number(indiceMeanBySex.male.toFixed(2)) : "-"}
                          icon={Scale}
                        />
                      </MagicCard>
                    </div>
                    <div title={indiceMeanBySex?.female == null ? "Calcul = Cumul aliment consommé / Poids vif produit. Saisir les données de consommation et le poids moyen réel (performances) pour afficher l'indice." : undefined}>
                      <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Moy. INDICE DE CONSOMMATION RÉEL — Femelle"
                          value={indiceMeanBySex?.female != null ? Number(indiceMeanBySex.female.toFixed(2)) : "-"}
                          icon={Scale}
                        />
                      </MagicCard>
                    </div>
                  </div>

                  <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${canSeePricing ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Effectif restant fin de semaine"
                          value={costsSummary.effectifRestantFinSemaine ?? 0}
                          icon={Bird}
                          animateValue
                        />
                      </MagicCard>
                    {canSeePricing && (
                      <>
                        <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                          <KPICard
                            label="Prix de revient / sujet"
                            value={costsSummary.prixRevientParSujet != null ? String(Number(costsSummary.prixRevientParSujet).toFixed(2)) + " DH" : "-"}
                            icon={DollarSign}
                          />
                        </MagicCard>
                        <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                          <KPICard
                            label="Prix de revient / kg"
                            value={costsSummary.prixRevientParKg != null ? String(Number(costsSummary.prixRevientParKg).toFixed(2)) + " DH" : "-"}
                            icon={DollarSign}
                          />
                        </MagicCard>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300">
                      <WaterConsumptionLineChart
                        data={dailyWaterData}
                        semaine={filters.week ?? ""}
                      />
                    </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300">
                      <MortalityLineChart
                        data={dailyMortalityData}
                        semaine={filters.week ?? ""}
                      />
                    </MagicCard>
                  </div>
                </>
              )}
            </>
          )}

          {/* Daily Dashboard View (Responsable Ferme & Backoffice) */}
          {showDailyDashboard && (
            <>
              {dailyLoading && (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Chargement des métriques quotidiennes…</span>
                </div>
              )}

              {dailyError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                  {dailyError}
                </div>
              )}

              {!dailyLoading && (effectiveFarmIdForDaily != null) && !dailyError && dailySummary && (
                <>
                  {showFarmSelector && filters.farmId !== effectiveFarmIdForDaily && (
                    <p className="text-sm text-muted-foreground mb-2">
                      Affichage : <strong>{farms.find((f) => f.id === effectiveFarmIdForDaily)?.name ?? "Ferme"}</strong> — dernier jour du dernier lot
                    </p>
                  )}
                  {/* Moyenne INDICE DE CONSOMMATION RÉEL par sexe (même semaine que le rapport du jour). Nécessite: suivi consommation + poids vif produit (stock). */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
                    <div title={dailyIndiceMeanBySex?.male == null ? "Calcul = Cumul aliment consommé / Poids vif produit. Saisir les données de consommation et le poids moyen réel (performances) pour afficher l'indice." : undefined}>
                      <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Moy. INDICE DE CONSOMMATION RÉEL — Mâle"
                          value={dailyIndiceMeanBySex?.male != null ? Number(dailyIndiceMeanBySex.male.toFixed(2)) : "-"}
                          icon={Scale}
                        />
                      </MagicCard>
                    </div>
                    <div title={dailyIndiceMeanBySex?.female == null ? "Calcul = Cumul aliment consommé / Poids vif produit. Saisir les données de consommation et le poids moyen réel (performances) pour afficher l'indice." : undefined}>
                      <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Moy. INDICE DE CONSOMMATION RÉEL — Femelle"
                          value={dailyIndiceMeanBySex?.female != null ? Number(dailyIndiceMeanBySex.female.toFixed(2)) : "-"}
                          icon={Scale}
                        />
                      </MagicCard>
                    </div>
                  </div>
                  <DailyMetricsCard data={dailySummary} />
                </>
              )}

              {!dailyLoading && (effectiveFarmIdForDaily != null) && !dailyError && !dailySummary && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 py-16 animate-in fade-in duration-300">
                    <ClipboardList className="h-16 w-16 text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-display font-semibold text-foreground">
                      Aucune donnée disponible
                    </h2>
                    <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                      Aucun rapport journalier n'a été enregistré pour cette ferme.
                    </p>
                  </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
