/**
 * Tableau de bord — Single unified dashboard with real KPIs from database.
 * Tracks suivi technique, production, and costs per farm/lot/semaine.
 * Farm-specific data isolation: Responsable Ferme sees only their farm.
 * Data sources: suiviCoutHebdo.getResumeSummary, suiviConsommationHebdo.getResumeSummary, suiviTechniqueHebdo.list
 */

import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  DashboardFilterBar,
  KPICard,
} from "@/components/dashboard";
import type { DashboardFilters } from "@/components/dashboard";
import {
  Bird,
  Scale,
  HeartPulse,
  UtensilsCrossed,
  DollarSign,
  Users,
  Building2,
  ClipboardList,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { MagicCard } from "@/components/ui/magic-card";

const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

export default function Dashboard() {
  const { canAccessAllFarms, isResponsableFerme, selectedFarmId, selectedFarm } =
    useAuth();

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
  const canFetchData =
    hasFarmContext && !!filters.lot && !!filters.week;

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
              Suivi des indicateurs hebdomadaires - Production, mortalité, consommation et coûts
            </p>
          </div>

          <DashboardFilterBar
            filters={filters}
            onFiltersChange={setFilters}
            farms={farms}
            lots={lots}
            showFarmSelector={showFarmSelector}
            fixedFarmId={fixedFarmId}
          />

          {showFarmSelector && !hasFarmContext && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 py-16 animate-in fade-in duration-300">
                <Building2 className="h-16 w-16 text-muted-foreground" />
                <h2 className="mt-4 text-xl font-display font-semibold text-foreground">
                  Choisissez une ferme
                </h2>
                <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                  Sélectionnez une ferme, un lot et une semaine pour afficher les métriques.
                </p>
              </div>
          )}

          {hasFarmContext && !canFetchData && (
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

          {loading && canFetchData && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Chargement des données…</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              {error}
            </div>
          )}

          {!loading && canFetchData && !error && costsSummary != null && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                      label="Poids vif produit"
                      value={costsSummary.poidsVifProduitKg ?? 0}
                      unit="kg"
                      icon={Scale}
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
                      icon={UtensilsCrossed}
                    />
                  </MagicCard>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                    <KPICard
                      label="Effectif restant fin de semaine"
                      value={costsSummary.effectifRestantFinSemaine ?? 0}
                      icon={Users}
                      animateValue
                    />
                  </MagicCard>
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
              </div>

            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
