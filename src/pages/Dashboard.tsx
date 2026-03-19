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
  Calendar,
  CalendarRange,
  ArrowLeft,
  ChevronRight,
  Hash,
  Layers,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { api, type DailyDashboardSummary, type LotWithStatusResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { MagicCard } from "@/components/ui/magic-card";
import { Separator } from "@/components/ui/separator";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  exportDailyDashboardToExcel,
  exportDailyDashboardToPdf,
  exportWeeklyDashboardToExcel,
  exportWeeklyDashboardToPdf,
} from "@/lib/dashboardExport";

/** Icon for "Indice de Consommation aliment par bâtiment" — Wheat (feed) + Building2 (bâtiment) */
function IndiceBatimentSectionIcon() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center gap-0.5 rounded-lg bg-amber-500/10">
      <Wheat className="h-5 w-5 text-amber-600" />
      <Building2 className="h-4 w-4 text-amber-600/80 -ml-1" />
    </div>
  );
}

/** Icon for "Moy. Indice de Consommation aliment" (Mâle + Femelle) — Wheat in blue + pink */
function MoyIndiceSectionIcon() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center gap-0.5 rounded-lg bg-primary/10">
      <Wheat className="h-4 w-4 text-blue-500" />
      <Wheat className="h-4 w-4 text-pink-500" />
    </div>
  );
}

/** Icon for "Prix de revient" section — DollarSign (cost/unit price) */
function PrixRevientSectionIcon() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
      <DollarSign className="h-5 w-5 text-emerald-600" />
    </div>
  );
}

/** Two birds icon (blue + pink) for "Les deux" and effectif KPI cards */
function TwoBirdsIcon({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-0.5 ${className ?? ""}`}>
      <Bird className="h-4 w-4 shrink-0 text-blue-500" />
      <Bird className="h-4 w-4 shrink-0 text-pink-500" />
    </div>
  );
}

/** Single bird in red for Mortalité cumulative */
function RedBirdIcon({ className }: { className?: string }) {
  return <Bird className={`h-5 w-5 text-red-500 ${className ?? ""}`} />;
}

/** Wheat icon in blue for Moy. Indice de Consommation aliment — Mâle (describes feed consumption) */
function MoyIndiceMaleIcon({ className }: { className?: string }) {
  return <Wheat className={`h-5 w-5 text-blue-500 ${className ?? ""}`} />;
}

/** Wheat icon in pink for Moy. Indice de Consommation aliment — Femelle (describes feed consumption) */
function MoyIndiceFemelleIcon({ className }: { className?: string }) {
  return <Wheat className={`h-5 w-5 text-pink-500 ${className ?? ""}`} />;
}

const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];
const HEBDO_WEEKS = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);

/** Normalize building name to standard format (B1, B2, etc.) — matches SuiviTechniqueHebdomadaire */
function normalizeBatimentName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  if (/^B\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^Bâtiment\s*0*(\d+)$/i);
  return match ? `B${match[1]}` : trimmed;
}

/** Empty daily summary when the farm has no report data — show dashboard cards with no data instead of error */
const EMPTY_DAILY_SUMMARY: DailyDashboardSummary = {
  reportDate: "",
  lot: "",
  sexMetrics: [],
  totalMortality: 0,
  ageJour: null,
  semaine: null,
  effectifInitialByBuildingSex: [],
};

/** Batiment order for display (B1=1, B2=2, B3=3, B4=4). */
function batimentOrder(b: string): number {
  const m = /^B(\d+)$/i.exec((b ?? "").trim());
  return m ? parseInt(m[1], 10) : 999;
}

/** Build batiments per sex from InfosSetup. Returns { male, female, totalCount } — totalCount = nb unique batiments (male ∪ female). */
function batimentsBySexFromSetupInfo(rows: { building: string; sex: string; effectifMisEnPlace?: number | null }[]): {
  male: string[];
  female: string[];
  totalCount: number;
} {
  const male = new Set<string>();
  const female = new Set<string>();
  const all = new Set<string>();
  for (const r of rows) {
    const effectif = r.effectifMisEnPlace ?? 0;
    if (!(effectif > 0)) continue;
    const b = (r.building ?? "").trim();
    if (!b) continue;
    all.add(b);
    if (r.sex === "Mâle") male.add(b);
    else if (r.sex === "Femelle") female.add(b);
  }
  return {
    male: Array.from(male).sort(),
    female: Array.from(female).sort(),
    totalCount: all.size,
  };
}

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
  // RT-like workflow (entry → farm selection → daily/hebdo): RT, Admin, AND Backoffice (same navigation, Backoffice read-only)
  const useRtaLikeWorkflow = isResponsableTechnique || isAdministrateur || isBackofficeEmployer;
  // Weekly-specific: RT and Admin (e.g. canSeePricing)
  const showWeeklyDashboard = isResponsableTechnique || isAdministrateur;
  // RF-only: Responsable Ferme has fixed farm, uses simplified entry (du jour / hebdo) with rfView
  const showDailyDashboard = isResponsableFerme;

  // Responsable Ferme / Backoffice: entry → "Dashboard du jour" or "Dashboard hebdomadaire"
  type RfDashboardView = "entry" | "daily" | "hebdo";
  const [rfView, setRfView] = useState<RfDashboardView>("entry");

  // RT/Admin: entry → choose "Dashboard du jour" or "Dashboard hebdomadaire"
  // - du jour → daily-farms (farm cards) → daily (dashboard for selected farm, last day of lot)
  // - hebdomadaire → weekly (current filter + content)
  type RtaDashboardView = "entry" | "daily-farms" | "daily" | "weekly";
  const [rtaView, setRtaView] = useState<RtaDashboardView>("entry");
  const [selectedFarmIdForDaily, setSelectedFarmIdForDaily] = useState<number | null>(null);

  // Dashboard hebdomadaire: card-based step flow (farm → lot → week → sex → dashboard)
  type HebdoStep = "farm" | "lot" | "week" | "sex" | "dashboard";
  const [hebdoStep, setHebdoStep] = useState<HebdoStep>("farm");
  const [hebdoFarmId, setHebdoFarmId] = useState<number | null>(null);
  const [hebdoLot, setHebdoLot] = useState<string | null>(null);
  const [hebdoWeek, setHebdoWeek] = useState<string | null>(null);
  const [hebdoSex, setHebdoSex] = useState<string | null>(null);
  const [lotsForHebdo, setLotsForHebdo] = useState<string[]>([]);
  const [lotsForHebdoWithStatus, setLotsForHebdoWithStatus] = useState<LotWithStatusResponse[]>([]);

  const [filters, setFilters] = useState<DashboardFilters>(() => ({
    farmId: isResponsableFerme ? selectedFarmId : null,
    lot: null,
    week: null,
    sex: null,
  }));
  const [farms, setFarms] = useState<{ id: number; name: string; code: string }[]>([]);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  /** Lot status for the farm used in Dashboard du jour — to show empty dashboard when that lot is closed */
  const [dailyLotsWithStatus, setDailyLotsWithStatus] = useState<LotWithStatusResponse[]>([]);

  const { toast } = useToast();
  const canAccessClosedLot = isResponsableTechnique || isAdministrateur;

  const showFarmSelector = canAccessAllFarms;
  const fixedFarmId = isResponsableFerme ? selectedFarmId : null;
  const effectiveFarmId =
    filters.farmId ?? (isResponsableFerme ? selectedFarmId : null);
  const hasFarmContext = !!effectiveFarmId;

  // For daily dashboard: RF uses effectiveFarmId; RT/Admin/Backoffice in "daily" sub-view use selectedFarmIdForDaily.
  const effectiveFarmIdForDaily =
    useRtaLikeWorkflow && rtaView === "daily" && selectedFarmIdForDaily != null
      ? selectedFarmIdForDaily
      : effectiveFarmId ?? (showDailyDashboard && farms.length > 0 ? farms[0]?.id ?? null : null);
  
  // Weekly dashboard requires farm + lot + week
  // Also true for: RF in hebdo flow; Backoffice in weekly flow (rtaView=weekly, hebdoStep=dashboard)
  const isRfInHebdoDashboard =
    showDailyDashboard && rfView === "hebdo" && hebdoStep === "dashboard" && !!effectiveFarmId && !!hebdoLot && !!hebdoWeek;
  const isBackofficeInHebdoDashboard =
    isBackofficeEmployer && rtaView === "weekly" && hebdoStep === "dashboard" && !!hebdoFarmId && !!hebdoLot && !!hebdoWeek;
  const canFetchWeeklyData =
    (showWeeklyDashboard && hasFarmContext && !!filters.lot && !!filters.week) ||
    isRfInHebdoDashboard ||
    isBackofficeInHebdoDashboard;
  
  // Daily dashboard: RF when rfView=daily; RT/Admin/Backoffice when rtaView=daily with farm selected
  const canFetchDailyData =
    (showDailyDashboard && rfView === "daily" && !!effectiveFarmIdForDaily) ||
    (useRtaLikeWorkflow && rtaView === "daily" && !!selectedFarmIdForDaily);
  
  // Legacy for backwards compatibility — weekly fetch uses effectiveFarmId, filters, or hebdo* for RF
  const canFetchData = canFetchWeeklyData;
  const effectiveFarmIdForWeekly =
    isRfInHebdoDashboard ? effectiveFarmId : isBackofficeInHebdoDashboard ? hebdoFarmId : (filters.farmId ?? effectiveFarmId);
  const effectiveLotForWeekly = isRfInHebdoDashboard || isBackofficeInHebdoDashboard ? hebdoLot : filters.lot;
  const effectiveWeekForWeekly = isRfInHebdoDashboard || isBackofficeInHebdoDashboard ? hebdoWeek : filters.week;
  const effectiveSexForWeekly = isRfInHebdoDashboard || isBackofficeInHebdoDashboard ? hebdoSex : filters.sex ?? hebdoSex;
  
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
      api.farms.lotsWithStatus(effectiveFarmId).then((data) => {
        setLotsWithStatus(data ?? []);
        setLots((data ?? []).map((x) => x.lot));
      }).catch(() => { setLotsWithStatus([]); setLots([]); });
    } else {
      setLotsWithStatus([]);
      setLots([]);
    }
  }, [effectiveFarmId]);

  // Fetch lots for hebdo farm selection (when in weekly flow with farm selected)
  useEffect(() => {
    if (hebdoFarmId && rtaView === "weekly") {
      api.farms.lotsWithStatus(hebdoFarmId).then((data) => {
        setLotsForHebdoWithStatus(data ?? []);
        setLotsForHebdo((data ?? []).map((x) => x.lot));
      }).catch(() => { setLotsForHebdoWithStatus([]); setLotsForHebdo([]); });
    } else {
      setLotsForHebdoWithStatus([]);
      setLotsForHebdo([]);
    }
  }, [hebdoFarmId, rtaView]);

  // Load lot status for daily dashboard farm so we can show empty dashboard when the "last lot" is closed
  const isInDailyView = (showDailyDashboard && rfView === "daily") || (useRtaLikeWorkflow && rtaView === "daily");
  useEffect(() => {
    if (isInDailyView && effectiveFarmIdForDaily) {
      api.farms.lotsWithStatus(effectiveFarmIdForDaily).then((data) => {
        setDailyLotsWithStatus(data ?? []);
      }).catch(() => setDailyLotsWithStatus([]));
    } else {
      setDailyLotsWithStatus([]);
    }
  }, [isInDailyView, effectiveFarmIdForDaily]);

  /** When the last day's lot (from getDashboardSummary) is closed, show empty dashboard for all users */
  const isDailyLotClosed = Boolean(
    dailySummary?.lot && dailyLotsWithStatus.some((l) => l.lot === dailySummary.lot && l.closed)
  );

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
  /** Moyen d'indice de Consommation aliment par sexe (weekly) = (indice B1 + indice B3 + …) / nb bâtiments. */
  const [indiceMeanBySex, setIndiceMeanBySex] = useState<{ male: number | null; female: number | null } | null>(null);
  /** Indice de conso par (batiment, sex) — affiché au-dessus des moyennes (weekly). */
  const [indiceByBatiment, setIndiceByBatiment] = useState<{ batiment: string; sex: string; value: number | null }[]>([]);
  /** Moyen d'indice de Consommation aliment par sexe (daily dashboard — Responsable Ferme). */
  const [dailyIndiceMeanBySex, setDailyIndiceMeanBySex] = useState<{ male: number | null; female: number | null } | null>(null);
  /** Indice de conso par (batiment, sex) — daily dashboard. */
  const [dailyIndiceByBatiment, setDailyIndiceByBatiment] = useState<{ batiment: string; sex: string; value: number | null }[]>([]);
  /** SetupInfo from InfosSetup — batiments par sexe pour le calcul du moyen d'indice de conso aliment */
  const [setupInfoRows, setSetupInfoRows] = useState<{ building: string; sex: string; effectifMisEnPlace?: number | null }[]>([]);

  // Fetch SetupInfo (InfosSetup) to derive batiments per sex for moyenne INDICE DE CONSOMMATION
  const isDailyViewForSetup = (showDailyDashboard && rfView === "daily") || (useRtaLikeWorkflow && rtaView === "daily");
  const isHebdoViewForSetup = (showDailyDashboard && rfView === "hebdo") || (isBackofficeEmployer && rtaView === "weekly");
  useEffect(() => {
    const farmId = isDailyViewForSetup ? effectiveFarmIdForDaily : (isHebdoViewForSetup ? effectiveFarmIdForWeekly : effectiveFarmId);
    const lot = isDailyViewForSetup ? dailySummary?.lot : (isHebdoViewForSetup ? effectiveLotForWeekly : filters.lot);
    if (!farmId || !lot) {
      setSetupInfoRows([]);
      return;
    }
    if (isDailyViewForSetup && isDailyLotClosed) {
      setSetupInfoRows([]);
      return;
    }
    api.setupInfo
      .list(farmId, lot)
      .then((rows) => {
        const normalized = (rows ?? []).map((r) => ({
          ...r,
          building: normalizeBatimentName(r.building ?? ""),
        }));
        setSetupInfoRows(normalized);
      })
      .catch(() => setSetupInfoRows([]));
  }, [
    isDailyViewForSetup,
    isHebdoViewForSetup,
    effectiveFarmId,
    effectiveFarmIdForDaily,
    effectiveFarmIdForWeekly,
    effectiveLotForWeekly,
    filters.lot,
    dailySummary?.lot,
    isDailyLotClosed,
  ]);

  useEffect(() => {
    const farmId = effectiveFarmIdForWeekly ?? effectiveFarmId;
    const lot = effectiveLotForWeekly ?? filters.lot;
    const week = effectiveWeekForWeekly ?? filters.week;
    if (!canFetchData || !farmId || !lot || !week) {
      setCostsSummary(null);
      setConsoSummary(null);
      setHebdoList([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { male: batimentsMale, female: batimentsFemale } = batimentsBySexFromSetupInfo(setupInfoRows);
    const batimentsMaleSafe = batimentsMale.length > 0 ? batimentsMale : DEFAULT_BATIMENTS;
    const batimentsFemaleSafe = batimentsFemale.length > 0 ? batimentsFemale : DEFAULT_BATIMENTS;
    const batimentsAll = [...new Set([...batimentsMaleSafe, ...batimentsFemaleSafe])];

    const selectedSex = effectiveSexForWeekly ?? filters.sex ?? hebdoSex;
    const batimentsToUse: string[] =
      selectedSex === "Mâle" ? batimentsMaleSafe : selectedSex === "Femelle" ? batimentsFemaleSafe : batimentsAll;
    const batimentsStr = batimentsToUse.join(",");

    const hebdoMalePromise = api.suiviTechniqueHebdo.list({
      farmId: farmId,
      lot,
      sex: "Mâle",
      semaine: week,
    });
    const hebdoFemellePromise = api.suiviTechniqueHebdo.list({
      farmId: farmId,
      lot,
      sex: "Femelle",
      semaine: week,
    });

    Promise.all([
      api.suiviCoutHebdo.getResumeSummary({
        farmId: farmId,
        lot,
        semaine: week,
        batiments: batimentsStr,
      }),
      api.suiviConsommationHebdo.getResumeSummary({
        farmId: farmId,
        lot,
        semaine: week,
        batiments: batimentsToUse,
      }),
      Promise.all([hebdoMalePromise, hebdoFemellePromise]).then(([male, femelle]) => {
        const merged = [...(male ?? []), ...(femelle ?? [])];
        if (selectedSex === "Mâle") {
          return merged.filter((r) => r.sex === "Mâle" && batimentsMaleSafe.includes(r.batiment ?? ""));
        }
        if (selectedSex === "Femelle") {
          return merged.filter((r) => r.sex === "Femelle" && batimentsFemaleSafe.includes(r.batiment ?? ""));
        }
        return merged;
      }),
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
    filters.sex,
    hebdoSex,
    setupInfoRows,
  ]);

  // Moyen indice de conso aliment par sexe = (somme indices batiments du sexe) / nb TOTAL batiments (male + femelle)
  const indiceLot = effectiveLotForWeekly ?? filters.lot;
  const indiceWeek = effectiveWeekForWeekly ?? filters.week;
  useEffect(() => {
    if (!canFetchWeeklyData || !effectiveFarmIdForWeekly || !indiceLot || !indiceWeek) {
      setIndiceMeanBySex(null);
      setIndiceByBatiment([]);
      return;
    }
    const { male: batimentsMale, female: batimentsFemale, totalCount } = batimentsBySexFromSetupInfo(setupInfoRows);
    const batimentsM = batimentsMale.length > 0 ? batimentsMale : DEFAULT_BATIMENTS;
    const batimentsF = batimentsFemale.length > 0 ? batimentsFemale : DEFAULT_BATIMENTS;
    const divisor = totalCount > 0 ? totalCount : DEFAULT_BATIMENTS.length;
    const promises: Array<{ sex: string; batiment: string }> = [
      ...batimentsM.map((batiment) => ({ sex: "Mâle" as const, batiment })),
      ...batimentsF.map((batiment) => ({ sex: "Femelle" as const, batiment })),
    ];
    if (promises.length === 0) {
      setIndiceMeanBySex(null);
      return;
    }
    Promise.all(
      promises.map(({ sex, batiment }) =>
        api.suiviPerformancesHebdo
          .get({
            farmId: effectiveFarmIdForWeekly ?? effectiveFarmId,
            lot: indiceLot,
            semaine: indiceWeek,
            sex,
            batiment,
          })
          .then((res) => ({ batiment, sex, value: res.indiceConsommationReel ?? null }))
          .catch(() => ({ batiment, sex, value: null }))
      )
    ).then((results) => {
      const maleValues = results.filter((r) => r.sex === "Mâle" && r.value != null).map((r) => r.value as number);
      const femaleValues = results.filter((r) => r.sex === "Femelle" && r.value != null).map((r) => r.value as number);
      const mean = (arr: number[], div: number) =>
        arr.length === 0 || div <= 0 ? null : arr.reduce((a, b) => a + b, 0) / div;
      setIndiceMeanBySex({
        male: mean(maleValues, divisor),
        female: mean(femaleValues, divisor),
      });
      setIndiceByBatiment(results.map((r) => ({ batiment: r.batiment, sex: r.sex, value: r.value })));
    });
  }, [canFetchWeeklyData, effectiveFarmIdForWeekly, effectiveFarmId, indiceLot, indiceWeek, setupInfoRows]);

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
        setDailySummary(data ?? EMPTY_DAILY_SUMMARY);
        setDailyError(null);
      })
      .catch(() => {
        // No data or empty/invalid response (e.g. "Unexpected end of JSON input") → show empty cards
        setDailySummary(EMPTY_DAILY_SUMMARY);
        setDailyError(null);
      })
      .finally(() => setDailyLoading(false));
  }, [canFetchDailyData, effectiveFarmIdForDaily]);

  // Moyen indice de conso aliment par sexe (daily) = (somme indices batiments du sexe) / nb TOTAL batiments
  const showDailyIndice = showDailyDashboard || (useRtaLikeWorkflow && rtaView === "daily");
  useEffect(() => {
    if (!showDailyIndice || !effectiveFarmIdForDaily || !dailySummary?.lot || !dailySummary?.semaine || isDailyLotClosed) {
      setDailyIndiceMeanBySex(null);
      setDailyIndiceByBatiment([]);
      return;
    }
    const lot = dailySummary.lot;
    const s = dailySummary.semaine;
    const semaine = s != null ? (typeof s === "number" ? `S${s}` : String(s).startsWith("S") ? String(s) : `S${s}`) : "";
    if (!semaine) {
      setDailyIndiceMeanBySex(null);
      return;
    }
    const { male: batimentsMale, female: batimentsFemale, totalCount } = batimentsBySexFromSetupInfo(setupInfoRows);
    const batimentsM = batimentsMale.length > 0 ? batimentsMale : DEFAULT_BATIMENTS;
    const batimentsF = batimentsFemale.length > 0 ? batimentsFemale : DEFAULT_BATIMENTS;
    const divisor = totalCount > 0 ? totalCount : DEFAULT_BATIMENTS.length;
    const promises: Array<{ sex: string; batiment: string }> = [
      ...batimentsM.map((batiment) => ({ sex: "Mâle" as const, batiment })),
      ...batimentsF.map((batiment) => ({ sex: "Femelle" as const, batiment })),
    ];
    if (promises.length === 0) {
      setDailyIndiceMeanBySex(null);
      return;
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
          .then((res) => ({ batiment, sex, value: res.indiceConsommationReel ?? null }))
          .catch(() => ({ batiment, sex, value: null }))
      )
    ).then((results) => {
      const maleValues = results.filter((r) => r.sex === "Mâle" && r.value != null).map((r) => r.value as number);
      const femaleValues = results.filter((r) => r.sex === "Femelle" && r.value != null).map((r) => r.value as number);
      const mean = (arr: number[], div: number) =>
        arr.length === 0 || div <= 0 ? null : arr.reduce((a, b) => a + b, 0) / div;
      setDailyIndiceMeanBySex({
        male: mean(maleValues, divisor),
        female: mean(femaleValues, divisor),
      });
      setDailyIndiceByBatiment(results.map((r) => ({ batiment: r.batiment, sex: r.sex, value: r.value })));
    });
  }, [showDailyIndice, effectiveFarmIdForDaily, dailySummary?.lot, dailySummary?.semaine, setupInfoRows, isDailyLotClosed]);

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

  /** Effectif mis en place — sum from SetupInfo (InfosSetup). When sex selected, only sum rows for that sex. */
  const selectedSexForEffectif = effectiveSexForWeekly ?? filters.sex ?? hebdoSex;
  const effectifMisEnPlace = useMemo(() => {
    if (!setupInfoRows.length) return 0;
    const rows = setupInfoRows.filter((r) => (r.effectifMisEnPlace ?? 0) > 0);
    const filtered =
      selectedSexForEffectif === "Mâle"
        ? rows.filter((r) => r.sex === "Mâle")
        : selectedSexForEffectif === "Femelle"
          ? rows.filter((r) => r.sex === "Femelle")
          : rows;
    return filtered.reduce((sum, r) => sum + (r.effectifMisEnPlace ?? 0), 0);
  }, [setupInfoRows, selectedSexForEffectif]);

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
                Tableau de bord
                {isBackofficeEmployer && (
                  <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Consultation seule
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {showDailyDashboard && rfView === "entry"
                  ? "Choisissez un type de tableau de bord"
                  : useRtaLikeWorkflow && rtaView === "entry"
                    ? "Choisissez un type de tableau de bord"
                    : useRtaLikeWorkflow && rtaView === "daily-farms"
                      ? "Sélectionnez une ferme pour le dashboard du jour"
                      : useRtaLikeWorkflow && rtaView === "daily"
                        ? "Dernier jour enregistré (dernier lot) — métriques quotidiennes"
                        : (useRtaLikeWorkflow && rtaView === "weekly") || (showDailyDashboard && rfView === "hebdo")
                          ? hebdoStep === "dashboard"
                            ? "Suivi des indicateurs hebdomadaires - Production, mortalité, consommation (données filtrées par sexe)"
                            : "Sélectionnez les critères pour afficher les métriques"
                          : showWeeklyDashboard
                            ? "Suivi des indicateurs hebdomadaires"
                            : "Dernier jour enregistré (dernier lot) — métriques quotidiennes"}
              </p>
            </div>
            {/* Back navigation for RT/Admin, RF in hebdo, or RF in daily (Dashboard du jour) */}
            {((useRtaLikeWorkflow && rtaView !== "entry") || (showDailyDashboard && (rfView === "hebdo" || rfView === "daily"))) && (
              <button
                type="button"
                onClick={() => {
                  if (showDailyDashboard && rfView === "daily") {
                    setRfView("entry");
                  } else if (showDailyDashboard && rfView === "hebdo") {
                    if (hebdoStep === "dashboard") setHebdoStep("sex");
                    else if (hebdoStep === "sex") { setHebdoStep("week"); setHebdoSex(null); }
                    else if (hebdoStep === "week") { setHebdoStep("lot"); setHebdoWeek(null); }
                    else if (hebdoStep === "lot") { setRfView("entry"); setHebdoLot(null); setHebdoFarmId(null); }
                  } else if (rtaView === "weekly") {
                    if (hebdoStep === "dashboard") setHebdoStep("sex");
                    else if (hebdoStep === "sex") { setHebdoStep("week"); setHebdoSex(null); }
                    else if (hebdoStep === "week") { setHebdoStep("lot"); setHebdoWeek(null); }
                    else if (hebdoStep === "lot") { setHebdoStep("farm"); setHebdoLot(null); setHebdoFarmId(null); }
                    else setRtaView("entry");
                  } else if (rtaView === "daily") setRtaView("daily-farms");
                  else if (rtaView === "daily-farms") setRtaView("entry");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour
              </button>
            )}
          </div>

          {/* RT/Admin: Entry — two cards: Dashboard du jour / Dashboard hebdomadaire */}
          {useRtaLikeWorkflow && rtaView === "entry" && (
            <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
              <button
                type="button"
                onClick={() => setRtaView("daily-farms")}
                className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-2xl"
              >
                <MagicCard className="rounded-2xl border border-border bg-card p-0 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="flex flex-col p-6 sm:p-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Calendar className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 font-display text-xl font-semibold text-foreground sm:text-2xl">
                      Dashboard du jour
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Consultez les métriques du dernier jour enregistré par ferme. Choisissez une ferme pour afficher le même tableau de bord que le responsable de ferme.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Entrer
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </MagicCard>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRtaView("weekly");
                  setHebdoStep("farm");
                  setHebdoFarmId(null);
                  setHebdoLot(null);
                  setHebdoWeek(null);
                  setHebdoSex(null);
                }}
                className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-2xl"
              >
                <MagicCard className="rounded-2xl border border-border bg-card p-0 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="flex flex-col p-6 sm:p-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CalendarRange className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 font-display text-xl font-semibold text-foreground sm:text-2xl">
                      Dashboard hebdomadaire
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Suivi des indicateurs par lot et par semaine : production, mortalité, consommation et coûts.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Entrer
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </MagicCard>
              </button>
            </div>
          )}

          {/* RT/Admin: Farm selection for Dashboard du jour */}
          {useRtaLikeWorkflow && rtaView === "daily-farms" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cliquez sur une ferme pour afficher le dashboard du dernier jour du dernier lot.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {farms.map((farm) => (
                  <button
                    key={farm.id}
                    type="button"
                    onClick={() => {
                      setSelectedFarmIdForDaily(farm.id);
                      setRtaView("daily");
                    }}
                    className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                  >
                    <MagicCard className="rounded-xl border border-border bg-card p-5 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-6 w-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate">{farm.name}</p>
                          <p className="text-xs text-muted-foreground">{farm.code}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </MagicCard>
                  </button>
                ))}
              </div>
              {farms.length === 0 && !canAccessAllFarms && (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                  Aucune ferme disponible.
                </div>
              )}
            </div>
          )}

          {/* Weekly Dashboard: Card-based filter flow (farm → lot → week → sex → dashboard) */}
          {useRtaLikeWorkflow && rtaView === "weekly" && hebdoStep !== "dashboard" && (
            <div className="space-y-6">
              {/* Breadcrumb */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className={hebdoStep === "farm" ? "font-medium text-foreground" : ""}>1. Ferme</span>
                <ChevronRight className="h-4 w-4" />
                <span className={hebdoStep === "lot" ? "font-medium text-foreground" : ""}>2. Lot</span>
                <ChevronRight className="h-4 w-4" />
                <span className={hebdoStep === "week" ? "font-medium text-foreground" : ""}>3. Semaine</span>
                <ChevronRight className="h-4 w-4" />
                <span className={hebdoStep === "sex" ? "font-medium text-foreground" : ""}>4. Sexe</span>
              </div>

              {/* Step 1: Farm cards */}
              {hebdoStep === "farm" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Choisissez une ferme</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {farms.map((farm) => (
                      <button
                        key={farm.id}
                        type="button"
                        onClick={() => { setHebdoFarmId(farm.id); setHebdoStep("lot"); }}
                        className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                      >
                        <MagicCard className="rounded-xl border border-border bg-card p-5 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Building2 className="h-6 w-6 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">{farm.name}</p>
                              <p className="text-xs text-muted-foreground">{farm.code}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                        </MagicCard>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Lot cards */}
              {hebdoStep === "lot" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choisissez un lot pour <strong>{farms.find((f) => f.id === hebdoFarmId)?.name ?? "cette ferme"}</strong>
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {lotsForHebdoWithStatus.map(({ lot: lotName, closed }) => (
                      <button
                        key={lotName}
                        type="button"
                        onClick={() => { setHebdoLot(lotName); setHebdoStep("week"); }}
                        className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                      >
                        <MagicCard className={`rounded-xl border p-5 transition-all duration-300 group-hover:shadow-md ${
                          closed ? "border-muted-foreground/30 bg-muted/60" : "border-border bg-card group-hover:border-primary/50"
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${closed ? "bg-muted-foreground/20" : "bg-emerald-500/10"}`}>
                              <Layers className={`h-6 w-6 ${closed ? "text-muted-foreground" : "text-emerald-600"}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`font-semibold ${closed ? "text-muted-foreground" : "text-foreground"}`}>{lotName}</p>
                              {closed && <p className="text-xs text-muted-foreground">Lot fermé</p>}
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                        </MagicCard>
                      </button>
                    ))}
                  </div>
                  {lotsForHebdoWithStatus.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 text-center text-sm text-muted-foreground">
                      Aucun lot disponible.
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Week boxes */}
              {hebdoStep === "week" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choisissez la semaine pour le lot <strong>{hebdoLot}</strong>
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {HEBDO_WEEKS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => { setHebdoWeek(w); setHebdoStep("sex"); }}
                        className="group rounded-lg border border-border bg-card px-3 py-2.5 text-center font-medium transition-all hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <span className="text-foreground group-hover:text-primary">{w}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Sex cards (Both, Mâle, Femelle) */}
              {hebdoStep === "sex" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choisissez le sexe pour <strong>{hebdoLot}</strong> — {hebdoWeek}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { value: null, label: "Les deux (Mâle + Femelle)", icon: TwoBirdsIcon, iconClassName: "h-full w-full flex items-center justify-center gap-0.5" },
                      { value: "Mâle", label: "Mâle", icon: Bird, iconClassName: "h-6 w-6 text-blue-500" },
                      { value: "Femelle", label: "Femelle", icon: Bird, iconClassName: "h-6 w-6 text-pink-500" },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setHebdoSex(opt.value);
                          setFilters({ farmId: hebdoFarmId, lot: hebdoLot, week: hebdoWeek, sex: opt.value });
                          setHebdoStep("dashboard");
                        }}
                        className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                      >
                        <MagicCard className="rounded-xl border border-border bg-card p-5 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
                              <opt.icon className={"iconClassName" in opt ? opt.iconClassName : "h-6 w-6 text-primary"} />
                            </div>
                            <p className="font-semibold text-foreground">{opt.label}</p>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
                          </div>
                        </MagicCard>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Weekly Dashboard View (RT & Admin, or RF/Backoffice in hebdo) — metrics when hebdoStep === 'dashboard' */}
          {((useRtaLikeWorkflow && rtaView === "weekly") || (showDailyDashboard && rfView === "hebdo")) && hebdoStep === "dashboard" && (
            <>
              {/* Selection summary badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-muted-foreground">Filtre actif :</span>
                  <span className="font-medium text-foreground">
                    {farms.find((f) => f.id === (hebdoFarmId ?? effectiveFarmId))?.name ?? selectedFarm?.name ?? "—"}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="font-medium text-foreground">{hebdoLot ?? "—"}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="font-medium text-foreground">{hebdoWeek ?? "—"}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="font-medium text-foreground">
                    {hebdoSex == null ? "Les deux (Mâle + Femelle)" : hebdoSex}
                  </span>
                </div>
                {!loading && canFetchWeeklyData && !error && (
                  <TooltipProvider>
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <ShimmerButton
                              type="button"
                              className="h-9 w-9 shrink-0 p-0 [border-radius:9999px] border-primary/40 text-primary"
                              background="#f1f5f9"
                              shimmerColor="rgba(37,99,235,0.3)"
                              shimmerDuration="2.5s"
                              aria-label="Télécharger Excel ou PDF"
                            >
                              <Download className="h-4 w-4 text-primary" />
                            </ShimmerButton>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="font-medium">
                          Télécharger (Excel ou PDF)
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end" className="min-w-[180px]">
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await exportWeeklyDashboardToExcel({
                                farmName: farms.find((f) => f.id === (hebdoFarmId ?? effectiveFarmId))?.name ?? selectedFarm?.name,
                                lot: hebdoLot ?? "",
                                week: hebdoWeek ?? "",
                                sex: hebdoSex,
                                costsSummary,
                                consoSummary,
                                totalMortality,
                                mortalityPct,
                                effectifDepart,
                                effectifMisEnPlace,
                                consoAlimentKg,
                                indiceByBatiment,
                                indiceMeanBySex,
                                dailyWaterData,
                                dailyMortalityData,
                                canSeePricing,
                              });
                              toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
                            } catch {
                              toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
                            }
                          }}
                          className="cursor-pointer gap-2"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                          Télécharger Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            try {
                              exportWeeklyDashboardToPdf({
                                farmName: farms.find((f) => f.id === (hebdoFarmId ?? effectiveFarmId))?.name ?? selectedFarm?.name,
                                lot: hebdoLot ?? "",
                                week: hebdoWeek ?? "",
                                sex: hebdoSex,
                                costsSummary,
                                consoSummary,
                                totalMortality,
                                mortalityPct,
                                effectifDepart,
                                effectifMisEnPlace,
                                consoAlimentKg,
                                indiceByBatiment,
                                indiceMeanBySex,
                                dailyWaterData,
                                dailyMortalityData,
                                canSeePricing,
                              });
                              toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
                            } catch {
                              toast({ title: "Erreur", description: "Impossible de générer le fichier PDF.", variant: "destructive" });
                            }
                          }}
                          className="cursor-pointer gap-2"
                        >
                          <FileText className="h-4 w-4 text-red-600" />
                          Télécharger PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TooltipProvider>
                )}
              </div>

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
                  {/* Effectif départ, Effectif mis en place, Effectif restant fin de semaine — filtrés par sexe quand Mâle/Femelle sélectionné */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                      <KPICard
                        label={`Effectif départ de ${filters.week ?? hebdoWeek ?? ""}`}
                        value={effectifDepart}
                        icon={TwoBirdsIcon}
                        animateValue
                      />
                    </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                      <KPICard
                        label="Effectif mis en place"
                        value={effectifMisEnPlace}
                        icon={TwoBirdsIcon}
                        animateValue
                      />
                    </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                      <KPICard
                        label="Effectif restant fin de semaine"
                        value={costsSummary.effectifRestantFinSemaine ?? 0}
                        icon={TwoBirdsIcon}
                        animateValue
                      />
                    </MagicCard>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                      <KPICard
                        label="Total des oiseaux livrés"
                          value={costsSummary.totalNbreProduction ?? 0}
                          icon={TwoBirdsIcon}
                          animateValue
                        />
                      </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Mortalité cumulative"
                          value={totalMortality}
                          icon={RedBirdIcon}
                          animateValue
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

                  {/* INDICE DE CONSOMMATION par bâtiment et sexe (semaine) — filtered by selected sex when Mâle/Femelle */}
                  {(() => {
                    const indiceFiltered = hebdoSex != null
                      ? indiceByBatiment.filter((r) => r.sex === hebdoSex)
                      : indiceByBatiment;
                    return indiceFiltered.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <IndiceBatimentSectionIcon />
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            Indice de Consommation aliment par bâtiment ({filters.week ?? ""})
                            {hebdoSex != null && ` — ${hebdoSex}`}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {hebdoSex != null ? `Bâtiments avec ${hebdoSex}` : "Par bâtiment et sexe"}
                          </p>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {[...indiceFiltered]
                          .sort((a, b) => batimentOrder(a.batiment) - batimentOrder(b.batiment))
                          .map(({ batiment, sex, value }) => (
                          <MagicCard
                            key={`${batiment}-${sex}`}
                            className="rounded-xl border border-border bg-card p-4 animate-in fade-in duration-300"
                          >
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-primary shrink-0" />
                              <span className="text-xs font-medium text-muted-foreground truncate">
                                {batiment} — {sex}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xl font-bold text-foreground">
                              {value != null ? Number(value).toFixed(2) : "-"}
                            </p>
                          </MagicCard>
                        ))}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Moyen = (indice B1 + indice B3 + …) / nb total. When sex selected, show only that sex. */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <MoyIndiceSectionIcon />
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          Moy. Indice de Consommation aliment
                          {hebdoSex != null ? ` — ${hebdoSex}` : " — Mâle & Femelle"}
                        </h3>
                        <p className="text-xs text-muted-foreground">Moyenne par sexe</p>
                      </div>
                    </div>
                    <Separator />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {(hebdoSex == null || hebdoSex === "Mâle") && (
                    <div title="Moyen = (indice B1 + indice B3 + …) / nombre de bâtiments Mâle dans Données mises en place.">
                      <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Moy. Indice de Consommation aliment — Mâle"
                          value={indiceMeanBySex?.male != null ? Number(indiceMeanBySex.male.toFixed(2)) : "-"}
                          icon={MoyIndiceMaleIcon}
                        />
                      </MagicCard>
                    </div>
                    )}
                    {(hebdoSex == null || hebdoSex === "Femelle") && (
                    <div title="Moyen = (indice B2 + indice B4 + …) / nombre de bâtiments Femelle dans Données mises en place.">
                      <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                        <KPICard
                          label="Moy. Indice de Consommation aliment — Femelle"
                          value={indiceMeanBySex?.female != null ? Number(indiceMeanBySex.female.toFixed(2)) : "-"}
                          icon={MoyIndiceFemelleIcon}
                        />
                      </MagicCard>
                    </div>
                    )}
                  </div>
                  </div>

                  {(hebdoSex != null || canSeePricing) && (
                    <div className="space-y-4">
                      {canSeePricing && (
                        <>
                          <div className="flex items-center gap-3">
                            <PrixRevientSectionIcon />
                            <div>
                              <h3 className="text-base font-semibold text-foreground">Prix de revient</h3>
                              <p className="text-xs text-muted-foreground">Coûts unitaires par sujet et par kg</p>
                            </div>
                          </div>
                          <Separator />
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  )}

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300">
                      <WaterConsumptionLineChart
                        data={dailyWaterData}
                        semaine={filters.week ?? hebdoWeek ?? ""}
                      />
                    </MagicCard>
                    <MagicCard className="rounded-xl border border-border bg-card p-6 animate-in fade-in duration-300">
                      <MortalityLineChart
                        data={dailyMortalityData}
                        semaine={filters.week ?? hebdoWeek ?? ""}
                      />
                    </MagicCard>
                  </div>
                </>
              )}
            </>
          )}

          {/* Responsable Ferme / Backoffice: Entry — choose Dashboard du jour or Dashboard hebdomadaire */}
          {showDailyDashboard && rfView === "entry" && (
            <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
              <button
                type="button"
                onClick={() => setRfView("daily")}
                className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-2xl"
              >
                <MagicCard className="rounded-2xl border border-border bg-card p-0 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="flex flex-col p-6 sm:p-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Calendar className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 font-display text-xl font-semibold text-foreground sm:text-2xl">
                      Dashboard du jour
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Consultez les métriques du dernier jour enregistré pour votre ferme.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Entrer
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </MagicCard>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRfView("hebdo");
                  setHebdoFarmId(effectiveFarmId ?? null);
                  setHebdoStep("lot");
                  setHebdoLot(null);
                  setHebdoWeek(null);
                  setHebdoSex(null);
                }}
                className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-2xl"
              >
                <MagicCard className="rounded-2xl border border-border bg-card p-0 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="flex flex-col p-6 sm:p-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CalendarRange className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 font-display text-xl font-semibold text-foreground sm:text-2xl">
                      Dashboard hebdomadaire
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Suivi des indicateurs par lot et par semaine : production, mortalité, consommation. Données filtrées par sexe (Mâle / Femelle).
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Entrer
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </MagicCard>
              </button>
            </div>
          )}

          {/* RF Hebdo flow: lot → week → sex → dashboard (no farm step) */}
          {showDailyDashboard && rfView === "hebdo" && hebdoStep !== "dashboard" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className={hebdoStep === "lot" ? "font-medium text-foreground" : ""}>1. Lot</span>
                <ChevronRight className="h-4 w-4" />
                <span className={hebdoStep === "week" ? "font-medium text-foreground" : ""}>2. Semaine</span>
                <ChevronRight className="h-4 w-4" />
                <span className={hebdoStep === "sex" ? "font-medium text-foreground" : ""}>3. Sexe</span>
              </div>
              {hebdoStep === "lot" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Choisissez un lot</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {lotsWithStatus.map(({ lot: lotName, closed }) => {
                      const disabled = closed && !canAccessClosedLot;
                      return (
                        <button
                          key={lotName}
                          type="button"
                          onClick={() => {
                            if (disabled) {
                              toast({
                                title: "Lot fermé",
                                description: "Seuls le responsable technique et l'administrateur peuvent accéder à un lot fermé.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setHebdoLot(lotName);
                            setHebdoStep("week");
                          }}
                          className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                        >
                          <MagicCard className={`rounded-xl border p-5 transition-all duration-300 group-hover:shadow-md ${
                            closed ? "border-muted-foreground/30 bg-muted/60" : "border-border bg-card group-hover:border-primary/50"
                          } ${disabled ? "cursor-not-allowed opacity-90" : ""}`}>
                            <div className="flex items-center gap-3">
                              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${closed ? "bg-muted-foreground/20" : "bg-emerald-500/10"}`}>
                                <Layers className={`h-6 w-6 ${closed ? "text-muted-foreground" : "text-emerald-600"}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`font-semibold ${closed ? "text-muted-foreground" : "text-foreground"}`}>{lotName}</p>
                                {closed && <p className="text-xs text-muted-foreground">Lot fermé — accès réservé</p>}
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
                            </div>
                          </MagicCard>
                        </button>
                      );
                    })}
                  </div>
                  {lotsWithStatus.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 text-center text-sm text-muted-foreground">
                      Aucun lot disponible.
                    </div>
                  )}
                </div>
              )}
              {hebdoStep === "week" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Choisissez la semaine pour le lot <strong>{hebdoLot}</strong></p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {HEBDO_WEEKS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => { setHebdoWeek(w); setHebdoStep("sex"); }}
                        className="group rounded-lg border border-border bg-card px-3 py-2.5 text-center font-medium transition-all hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <span className="text-foreground group-hover:text-primary">{w}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hebdoStep === "sex" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choisissez le sexe pour <strong>{hebdoLot}</strong> — {hebdoWeek}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { value: null, label: "Les deux (Mâle + Femelle)", icon: TwoBirdsIcon, iconClassName: "h-full w-full flex items-center justify-center gap-0.5" },
                      { value: "Mâle", label: "Mâle", icon: Bird, iconClassName: "h-6 w-6 text-blue-500" },
                      { value: "Femelle", label: "Femelle", icon: Bird, iconClassName: "h-6 w-6 text-pink-500" },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setHebdoSex(opt.value);
                          setFilters({ farmId: effectiveFarmId ?? null, lot: hebdoLot ?? null, week: hebdoWeek ?? null, sex: opt.value ?? null });
                          setHebdoStep("dashboard");
                        }}
                        className="group w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl"
                      >
                        <MagicCard className="rounded-xl border border-border bg-card p-5 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
                              <opt.icon className={"iconClassName" in opt ? opt.iconClassName : "h-6 w-6 text-primary"} />
                            </div>
                            <p className="font-semibold text-foreground">{opt.label}</p>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground ml-auto" />
                          </div>
                        </MagicCard>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (hebdoStep === "sex") { setHebdoStep("week"); setHebdoSex(null); }
                  else if (hebdoStep === "week") { setHebdoStep("lot"); setHebdoWeek(null); }
                  else if (hebdoStep === "lot") { setRfView("entry"); setHebdoLot(null); setHebdoFarmId(null); }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/80"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour
              </button>
            </div>
          )}

          {/* Daily Dashboard View (Responsable Ferme & Backoffice when rfView=daily, or RT/Admin in "daily" sub-view) */}
          {((showDailyDashboard && rfView === "daily") || (useRtaLikeWorkflow && rtaView === "daily")) && (
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

              {!dailyLoading && (effectiveFarmIdForDaily != null) && !dailyError && dailySummary && isDailyLotClosed && (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 py-16 animate-in fade-in duration-300">
                  <ClipboardList className="h-16 w-16 text-amber-600 dark:text-amber-400" />
                  <h2 className="mt-4 text-xl font-display font-semibold text-amber-800 dark:text-amber-200">
                    Lot fermé
                  </h2>
                  <p className="mt-2 max-w-md text-center text-sm text-amber-700 dark:text-amber-300">
                    Le dernier jour enregistré appartient au lot <strong>{dailySummary.lot}</strong>, qui est fermé. Les données ne sont pas accessibles.
                  </p>
                </div>
              )}

              {!dailyLoading && (effectiveFarmIdForDaily != null) && !dailyError && dailySummary && !isDailyLotClosed && (
                <>
                  {/* Download bar — visible for all users (RF, RT, Admin, Backoffice) when daily data is shown */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 mb-4 text-sm">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Dashboard du jour</span>
                      {" — "}
                      <strong>{farms.find((f) => f.id === effectiveFarmIdForDaily)?.name ?? selectedFarm?.name ?? "Ferme"}</strong>
                      {" — "}
                      dernier jour du dernier lot
                    </p>
                    <TooltipProvider>
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <ShimmerButton
                                type="button"
                                className="h-9 w-9 shrink-0 p-0 [border-radius:9999px] border-primary/40 text-primary"
                                background="#f1f5f9"
                                shimmerColor="rgba(37,99,235,0.3)"
                                shimmerDuration="2.5s"
                                aria-label="Télécharger Excel ou PDF"
                              >
                                <Download className="h-4 w-4 text-primary" />
                              </ShimmerButton>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="font-medium">
                            Télécharger (Excel ou PDF)
                          </TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await exportDailyDashboardToExcel({
                                  data: dailySummary,
                                  farmName: farms.find((f) => f.id === effectiveFarmIdForDaily)?.name ?? selectedFarm?.name,
                                  indiceByBatiment: dailyIndiceByBatiment,
                                  indiceMeanBySex: dailyIndiceMeanBySex,
                                });
                                toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
                              } catch {
                                toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
                              }
                            }}
                            className="cursor-pointer gap-2"
                          >
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                            Télécharger Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              try {
                                exportDailyDashboardToPdf({
                                  data: dailySummary,
                                  farmName: farms.find((f) => f.id === effectiveFarmIdForDaily)?.name ?? selectedFarm?.name,
                                  indiceByBatiment: dailyIndiceByBatiment,
                                  indiceMeanBySex: dailyIndiceMeanBySex,
                                });
                                toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
                              } catch {
                                toast({ title: "Erreur", description: "Impossible de générer le fichier PDF.", variant: "destructive" });
                              }
                            }}
                            className="cursor-pointer gap-2"
                          >
                            <FileText className="h-4 w-4 text-red-600" />
                            Télécharger PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipProvider>
                  </div>
                  {/* Daily dashboard (Responsable Ferme / Backoffice): Date, Lot, Âge, Semaine, Mortalité totale du jour, then Indice de Consommation directly below */}
                  <DailyMetricsCard
                    data={dailySummary}
                    contentBelowMortality={
                      <>
                        {/* Indice de Consommation aliment par bâtiment + Moy. Mâle/Femelle — placed right below Mortalité totale du jour */}
                        {dailyIndiceByBatiment.length > 0 && dailySummary?.semaine != null && (
                          <div className="space-y-4 mb-6">
                            <div className="flex items-center gap-3">
                              <IndiceBatimentSectionIcon />
                              <div>
                                <h3 className="text-base font-semibold text-foreground">
                                  Indice de Consommation aliment par bâtiment (
                                  {typeof dailySummary.semaine === "number" ? `S${dailySummary.semaine}` : String(dailySummary.semaine)}
                                  )
                                </h3>
                                <p className="text-xs text-muted-foreground">Par bâtiment et sexe</p>
                              </div>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                              {[...dailyIndiceByBatiment]
                                .sort((a, b) => batimentOrder(a.batiment) - batimentOrder(b.batiment))
                                .map(({ batiment, sex, value }) => (
                                <MagicCard
                                  key={`${batiment}-${sex}`}
                                  className="rounded-xl border border-border bg-card p-4 animate-in fade-in duration-300"
                                >
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs font-medium text-muted-foreground truncate">
                                      {batiment} — {sex}
                                    </span>
                                  </div>
                                  <p className="mt-1.5 text-xl font-bold text-foreground">
                                    {value != null ? Number(value).toFixed(2) : "-"}
                                  </p>
                                </MagicCard>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Moyen = (indice B1 + indice B3 + …) / nb total bâtiments (Mâle + Femelle). */}
                        <div className="space-y-4 mb-6">
                          <div className="flex items-center gap-3">
                            <MoyIndiceSectionIcon />
                            <div>
                              <h3 className="text-base font-semibold text-foreground">
                                Moy. Indice de Consommation aliment — Mâle & Femelle
                              </h3>
                              <p className="text-xs text-muted-foreground">Moyenne par sexe</p>
                            </div>
                          </div>
                          <Separator />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div title="Moyen = (indice B1 + indice B3 + …) / nombre total de tous les bâtiments (Mâle + Femelle) dans Données mises en place.">
                            <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                              <KPICard
                                label="Moy. Indice de Consommation aliment — Mâle"
                                value={dailyIndiceMeanBySex?.male != null ? Number(dailyIndiceMeanBySex.male.toFixed(2)) : "-"}
                                icon={MoyIndiceMaleIcon}
                              />
                            </MagicCard>
                          </div>
                          <div title="Moyen = (indice B2 + indice B4 + …) / nombre total de tous les bâtiments (Mâle + Femelle) dans Données mises en place.">
                            <MagicCard className="rounded-xl border border-border bg-card p-5 animate-in fade-in duration-300">
                              <KPICard
                                label="Moy. Indice de Consommation aliment — Femelle"
                                value={dailyIndiceMeanBySex?.female != null ? Number(dailyIndiceMeanBySex.female.toFixed(2)) : "-"}
                                icon={MoyIndiceFemelleIcon}
                              />
                            </MagicCard>
                          </div>
                        </div>
                        </div>
                      </>
                    }
                  />
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
