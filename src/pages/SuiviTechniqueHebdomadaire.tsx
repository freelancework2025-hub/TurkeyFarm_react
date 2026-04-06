import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Calendar, Plus, Building, BarChart3, DollarSign, UserPlus, Trash2, Download, FileSpreadsheet, FileText } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import SuiviTechniqueBatimentContent from "@/components/suivi-technique/SuiviTechniqueBatimentContent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, type FarmResponse, type SetupInfoResponse, type LotWithStatusResponse, getStoredSelectedFarm } from "@/lib/api";
import { isClosedLotBlockedForSession, type ClosedLotSessionContext } from "@/lib/lotAccess";
import { exportToExcel, exportToPdf } from "@/lib/suiviTechniqueBatimentExport";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { canonicalSemaine } from "@/lib/semaineCanonical";

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

/**
 * Normalize building name to standard format (B1, B2, etc.)
 * Converts "Bâtiment 01" -> "B1", "Bâtiment 02" -> "B2", etc.
 */
function normalizeBatimentName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  
  // Already in correct format
  if (/^B\d+$/.test(trimmed)) return trimmed;
  
  // Convert "Bâtiment 01" format to "B1"
  const match = trimmed.match(/^Bâtiment\s*0*(\d+)$/i);
  if (match) {
    return `B${match[1]}`;
  }
  
  // Return as-is if no conversion needed
  return trimmed;
}

/** Represents setup info for a specific building and sex from InfosSetup page */
interface BuildingSexSetup {
  building: string;
  sex: string;
  effectifMisEnPlace: number;
  setupInfo: SetupInfoResponse;
}

type TabType = "male" | "femelle";

const TABS: { id: TabType; label: string; dotColor: string }[] = [
  { id: "male", label: "Mâle", dotColor: "bg-blue-500" },
  { id: "femelle", label: "Femelle", dotColor: "bg-rose-500" },
];

const TAB_TO_API_SEX: Record<TabType, string> = { male: "Mâle", femelle: "Femelle" };

/**
 * Suivi Technique Hebdomadaire — strict sequential workflow: Lot → Semaine → Batiment.
 * - Sidebar entry: user lands on step 1 (Lot, or Farm first if admin). No "view all" at batiment step.
 * - After lot: step 2 = Semaine only. After semaine: step 3 = Batiment boxes only (B1–B4 by default; input + "Ajouter" for B5, B6…).
 * - After choosing one batiment: user enters suivi for that batiment only. Tables empty if nothing saved yet.
 * - Batiment cannot be changed on the content screen; only "Retour au choix du bâtiment" clears batiment from URL and returns to step 3.
 * - INDICE EAU/ALIMENT (suivi consommation) : TOTAL S de CONSO. EAU (L) du bâtiment / CONSOMMATION ALIMENT — S du bâtiment (voir ConsumptionTrackingTable + API suivi consommation).
 * Permissions: per permission.mdc (all roles; create/update/delete by role).
 * RESPONSABLE_FERME: can add and save new data in child tables; saved rows/cells are read-only.
 * Number display: grouped thousands (space) + dot decimal via formatGroupedNumber (same as Résumé coûts / production).
 * Colonnes du tableau « Suivi hebdomadaire » (grille + exports Excel/PDF section 3) : `@/lib/suiviTechniqueHebdomadaireShared` — consommé par WeeklyTrackingTable et suiviTechniqueBatimentExport.
 * Mortalité du transport (ligne sous la grille, offset S2+, S1) : documentée en détail dans `WeeklyTrackingTable.tsx` et dans `TurkeyFarm/docs/CALCULS_ET_EQUATIONS.md` §8.1.
 */
export default function SuiviTechniqueHebdomadaire() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const semaineParam = searchParams.get("semaine") ?? "";
  const batimentParam = searchParams.get("batiment") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);
  const hasLotInUrl = lotParam.trim() !== "";
  const trimmedSemaine = semaineParam.trim();
  const hasSemaineInUrl = trimmedSemaine !== "";
  const selectedSemaine = trimmedSemaine;
  const selectedBatiment = batimentParam.trim();
  const hasBatimentInUrl = selectedBatiment !== "";
  /** For all users: show suivi content only when one batiment is selected. To change batiment, user must return to batiment selection. */
  const hasContentView = hasBatimentInUrl;

  const {
    user,
    isAdministrateur,
    isResponsableTechnique,
    isBackofficeEmployer,
    canAccessAllFarms,
    isReadOnly,
    selectedFarmId: authSelectedFarmId,
  } = useAuth();
  const canAccessResumeCouts = isAdministrateur || isResponsableTechnique || isBackofficeEmployer;
  const { toast } = useToast();
  const navigate = useNavigate();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const lotAccessCtx: ClosedLotSessionContext = useMemo(
    () => ({
      currentUserId: user?.id ?? null,
      isAdministrateur,
      isResponsableTechnique,
    }),
    [user?.id, isAdministrateur, isResponsableTechnique]
  );
  const isSelectedLotClosed = Boolean(
    hasLotInUrl &&
      lotParam.trim() &&
      isClosedLotBlockedForSession(lotsWithStatus.find((l) => l.lot === lotParam.trim()), lotAccessCtx)
  );
  
  /** Setup info data from InfosSetup page - contains building/sex/effectif configurations */
  const [setupInfoData, setSetupInfoData] = useState<SetupInfoResponse[]>([]);
  const [loadingSetupInfo, setLoadingSetupInfo] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>("male");
  /** After batiment is chosen: null = show sex chooser; set when user picks Mâle or Femelle. */
  const [initialSex, setInitialSex] = useState<TabType | null>(null);
  /** True after user confirms "Ajouter l'autre sexe" dialog; then calculated values are copied to the other sex. */
  const [otherSexEnabled, setOtherSexEnabled] = useState(false);
  /** Loading state for fetching configured sexes from backend. */
  const [loadingSexes, setLoadingSexes] = useState(false);
  const [newSemaineInput, setNewSemaineInput] = useState("");
  /** Extra batiments added by user (default is B1–B4). */
  const [extraBatiments, setExtraBatiments] = useState<string[]>([]);
  const [newBatimentInput, setNewBatimentInput] = useState("");
  /** Increment to refetch stock when hebdo / production / consumption / setup is saved. */
  const [stockRefreshKey, setStockRefreshKey] = useState(0);
  const refreshStock = useCallback(() => setStockRefreshKey((k) => k + 1), []);
  /** Dialog: activate other sex (open state + copy in progress). */
  const [otherSexDialogOpen, setOtherSexDialogOpen] = useState(false);
  const [copyToOtherSexLoading, setCopyToOtherSexLoading] = useState(false);
  /** Dialog: delete all data for the active sex. */
  const [deleteSexDialogOpen, setDeleteSexDialogOpen] = useState(false);
  const [deleteSexLoading, setDeleteSexLoading] = useState(false);

  // Get unique buildings from setupInfo data, then add default batiments and extra batiments
  const allBatiments = useMemo(() => {
    const setupBuildings = [...new Set(setupInfoData.map(d => d.building))];
    // Prioritize buildings from setupInfo, then add defaults that aren't already included
    const combined = [...setupBuildings];
    DEFAULT_BATIMENTS.forEach(b => {
      if (!combined.includes(b)) combined.push(b);
    });
    extraBatiments.forEach(b => {
      if (!combined.includes(b)) combined.push(b);
    });
    return combined;
  }, [setupInfoData, extraBatiments]);

  // Load farms for admin/RT (farm selector), export farm name when viewing bâtiment, or download per bâtiment
  useEffect(() => {
    if (!showFarmSelector && !hasContentView && !(hasLotInUrl && hasSemaineInUrl)) return;
    setFarmsLoading(true);
    api.farms
      .list()
      .then((list) => setFarms(list ?? []))
      .catch(() => setFarms([]))
      .finally(() => setFarmsLoading(false));
  }, [showFarmSelector, hasContentView, hasLotInUrl, hasSemaineInUrl]);

  const reportingFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  // Fetch configured sexes from backend when batiment and semaine are selected
  // Also check setupInfo data to determine which sexes have effectifMisEnPlace configured
  useEffect(() => {
    if (!reportingFarmId || !lotParam.trim() || !selectedBatiment || !trimmedSemaine) {
      setInitialSex(null);
      setOtherSexEnabled(false);
      return;
    }

    setLoadingSexes(true);
    
    // First check setupInfo to see which sexes have effectifMisEnPlace configured for this batiment
    const setupInfoSexes = setupInfoData
      .filter(info => info.building === selectedBatiment && info.effectifMisEnPlace > 0)
      .map(info => info.sex);
    
    api.suiviTechniqueSetup
      .getConfiguredSexes({ farmId: reportingFarmId, lot: lotParam.trim(), batiment: selectedBatiment, semaine: trimmedSemaine })
      .then((configuredSexes) => {
        // Combine configured sexes from suivi and available sexes from setupInfo
        // A sex is "available" if it has effectifMisEnPlace in setupInfo OR is already configured in suivi
        const availableSexes = [...new Set([...configuredSexes, ...setupInfoSexes])];
        
        if (availableSexes.length === 0) {
          // No sexes available - show sex chooser (user needs to configure in InfosSetup first)
          setInitialSex(null);
          setOtherSexEnabled(false);
        } else if (availableSexes.length === 1) {
          // One sex available - show that tab, allow adding the other if it has setupInfo
          const sex = availableSexes[0];
          const tabId: TabType = sex === "Mâle" ? "male" : "femelle";
          setInitialSex(tabId);
          setActiveTab(tabId);
          // Check if the other sex has setupInfo configured
          const otherSex = sex === "Mâle" ? "Femelle" : "Mâle";
          const otherSexHasSetupInfo = setupInfoData.some(
            info => info.building === selectedBatiment && info.sex === otherSex && info.effectifMisEnPlace > 0
          );
          setOtherSexEnabled(otherSexHasSetupInfo);
        } else {
          // Both sexes available - show both tabs
          // Default to male tab if available, otherwise femelle
          const defaultTab: TabType = availableSexes.includes("Mâle") ? "male" : "femelle";
          setInitialSex(defaultTab);
          setActiveTab(defaultTab);
          setOtherSexEnabled(true);
        }
      })
      .catch(() => {
        // On error, try to use setupInfo data only
        if (setupInfoSexes.length === 0) {
          setInitialSex(null);
          setOtherSexEnabled(false);
        } else if (setupInfoSexes.length === 1) {
          const sex = setupInfoSexes[0];
          const tabId: TabType = sex === "Mâle" ? "male" : "femelle";
          setInitialSex(tabId);
          setActiveTab(tabId);
          setOtherSexEnabled(false);
        } else {
          setInitialSex("male");
          setActiveTab("male");
          setOtherSexEnabled(true);
        }
      })
      .finally(() => setLoadingSexes(false));
  }, [reportingFarmId, lotParam, selectedBatiment, trimmedSemaine, setupInfoData]);

  // Load lots for selected farm (with status for closed-lot blocking)
  useEffect(() => {
    if (showFarmSelector || !reportingFarmId) return;
    setLotsLoading(true);
    api.farms
      .lotsWithStatus(reportingFarmId)
      .then((data) => {
        setLotsWithStatus(data ?? []);
        setLots((data ?? []).map((x) => x.lot));
      })
      .catch(() => { setLotsWithStatus([]); setLots([]); })
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, reportingFarmId]);

  // Load setupInfo data when lot is selected - this provides building/sex configurations from InfosSetup page
  // Normalize building names to standard format (B1, B2, etc.). Skip when lot is closed (no data access).
  useEffect(() => {
    if (!reportingFarmId || !hasLotInUrl || !lotParam.trim() || isSelectedLotClosed) {
      setSetupInfoData([]);
      return;
    }
    setLoadingSetupInfo(true);
    api.setupInfo
      .list(reportingFarmId, lotParam.trim())
      .then((data) => {
        // Normalize building names in the loaded data
        const normalizedData = (data ?? []).map(d => ({
          ...d,
          building: normalizeBatimentName(d.building),
        }));
        setSetupInfoData(normalizedData);
        // Extract unique normalized buildings from setupInfo and add to extraBatiments if not already present
        const setupBuildings = [...new Set(normalizedData.map(d => d.building))];
        const newBuildings = setupBuildings.filter(b => !DEFAULT_BATIMENTS.includes(b) && !extraBatiments.includes(b));
        if (newBuildings.length > 0) {
          setExtraBatiments(prev => [...prev, ...newBuildings]);
        }
      })
      .catch(() => setSetupInfoData([]))
      .finally(() => setLoadingSetupInfo(false));
  }, [reportingFarmId, hasLotInUrl, lotParam, isSelectedLotClosed]);

  // Get available sexes for the selected batiment from setupInfo data
  const getAvailableSexesFromSetupInfo = useCallback((batiment: string): BuildingSexSetup[] => {
    return setupInfoData
      .filter(info => info.building === batiment && info.effectifMisEnPlace > 0)
      .map(info => ({
        building: info.building,
        sex: info.sex,
        effectifMisEnPlace: info.effectifMisEnPlace,
        setupInfo: info,
      }));
  }, [setupInfoData]);

  // Get setupInfo for a specific batiment and sex
  const getSetupInfoForBatimentSex = useCallback((batiment: string, sex: string): SetupInfoResponse | undefined => {
    return setupInfoData.find(info => info.building === batiment && info.sex === sex);
  }, [setupInfoData]);

  const selectFarm = useCallback(
    (id: number) => {
      setSearchParams({ farmId: String(id) });
    },
    [setSearchParams]
  );

  const clearFarmSelection = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const clearSemaineSelection = useCallback(() => {
    const next: Record<string, string> = {};
    if (reportingFarmId != null) next.farmId = String(reportingFarmId);
    if (lotParam.trim()) next.lot = lotParam.trim();
    setSearchParams(next);
  }, [reportingFarmId, lotParam, setSearchParams]);

  /** Set URL to lot + semaine only (no batiment). User must then choose a batiment on the next step. */
  const selectSemaine = useCallback(
    (semaine: string) => {
      const next: Record<string, string> = {};
      if (reportingFarmId != null) next.farmId = String(reportingFarmId);
      if (lotParam.trim()) next.lot = lotParam.trim();
      next.semaine = semaine;
      // Do not include batiment — force the batiment selection step to appear
      setSearchParams(next, { replace: true });
    },
    [reportingFarmId, lotParam, setSearchParams]
  );

  const buildBaseParams = useCallback(() => {
    const next: Record<string, string> = {};
    if (reportingFarmId != null) next.farmId = String(reportingFarmId);
    if (lotParam.trim()) next.lot = lotParam.trim();
    if (trimmedSemaine) next.semaine = trimmedSemaine;
    return next;
  }, [reportingFarmId, lotParam, trimmedSemaine]);

  const selectBatiment = useCallback(
    (batiment: string) => {
      const next = { ...buildBaseParams(), batiment };
      setSearchParams(next);
    },
    [buildBaseParams, setSearchParams]
  );

  /** Return to batiment selection; user cannot change batiment from within content. */
  const clearBatimentSelection = useCallback(() => {
    setSearchParams(buildBaseParams());
  }, [buildBaseParams, setSearchParams]);

  const addBatiment = useCallback(() => {
    const value = newBatimentInput.trim();
    if (!value || allBatiments.some((b) => b.toUpperCase() === value.toUpperCase())) return;
    setExtraBatiments((prev) => [...prev, value]);
    setNewBatimentInput("");
  }, [newBatimentInput, allBatiments]);

  /** Enable the other sex tab without copying any data. Table (setup form) is empty; user fills setup and effectif de départ for the new sex. */
  const enableOtherSex = useCallback(() => {
    const otherTab: TabType = initialSex === "male" ? "femelle" : "male";
    setOtherSexEnabled(true);
    setActiveTab(otherTab);
    refreshStock();
    toast({
      title: "Succès",
      description: "L'autre sexe a été activé. Le formulaire de setup est vide — renseignez les données et l'effectif de départ, puis enregistrez.",
    });
  }, [initialSex, refreshStock, toast]);

  const handleConfirmOtherSex = useCallback(() => {
    if (
      reportingFarmId == null ||
      !lotParam.trim() ||
      !selectedSemaine ||
      !selectedBatiment ||
      initialSex == null
    )
      return;
    setCopyToOtherSexLoading(true);
    enableOtherSex();
    setOtherSexDialogOpen(false);
    setCopyToOtherSexLoading(false);
  }, [reportingFarmId, lotParam, selectedSemaine, selectedBatiment, initialSex, enableOtherSex]);

  const handleConfirmDeleteSex = useCallback(async () => {
    if (reportingFarmId == null || !lotParam.trim() || !selectedBatiment || !selectedSemaine) return;
    const sexToDelete = TAB_TO_API_SEX[activeTab];
    setDeleteSexLoading(true);
    try {
      await api.suiviTechniqueSetup.deleteAllDataForSex({
        farmId: reportingFarmId,
        lot: lotParam.trim(),
        batiment: selectedBatiment,
        sex: sexToDelete,
        semaine: selectedSemaine,
      });
      setDeleteSexDialogOpen(false);
      refreshStock();
      const sexes = await api.suiviTechniqueSetup.getConfiguredSexes({
        farmId: reportingFarmId,
        lot: lotParam.trim(),
        batiment: selectedBatiment,
        semaine: selectedSemaine,
      });
      if (sexes.length === 0) {
        setInitialSex(null);
        setOtherSexEnabled(false);
        setActiveTab("male");
      } else if (sexes.length === 1) {
        const tabId: TabType = sexes[0] === "Mâle" ? "male" : "femelle";
        setInitialSex(tabId);
        setActiveTab(tabId);
        setOtherSexEnabled(false);
      } else {
        const otherTab: TabType = activeTab === "male" ? "femelle" : "male";
        setActiveTab(otherTab);
        setInitialSex("male");
        setOtherSexEnabled(true);
      }
      toast({
        title: "Données supprimées",
        description: `Les données pour le sexe « ${sexToDelete} » ont été supprimées pour ce bâtiment et la semaine ${selectedSemaine} uniquement.`,
      });
    } catch {
      /* API error — logged in backend only */
    } finally {
      setDeleteSexLoading(false);
    }
  }, [reportingFarmId, lotParam, selectedBatiment, selectedSemaine, activeTab, refreshStock, toast]);

  const canDeleteSexData = isResponsableTechnique || isAdministrateur;

  const exportFarmName =
    canAccessAllFarms && isValidFarmId && reportingFarmId != null
      ? farms.find((f) => f.id === reportingFarmId)?.name ?? getStoredSelectedFarm()?.name ?? "Ferme"
      : getStoredSelectedFarm()?.name ?? "Ferme";

  const handleExportBatiment = useCallback(
    async (batiment: string, sex: string, format: "excel" | "pdf") => {
      if (!reportingFarmId || !lotParam.trim() || !selectedSemaine) return;
      try {
        const params = {
          farmName: exportFarmName,
          farmId: reportingFarmId,
          lot: lotParam.trim(),
          semaine: selectedSemaine,
          batiment,
          sex,
        };
        if (format === "excel") {
          await exportToExcel(params);
          toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
        } else {
          await exportToPdf(params);
          toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
        }
      } catch {
        toast({
          title: "Erreur",
          description: `Impossible de générer le fichier ${format === "excel" ? "Excel" : "PDF"}.`,
          variant: "destructive",
        });
      }
    },
    [reportingFarmId, lotParam, selectedSemaine, exportFarmName, toast]
  );

  const getSexesForBatiment = useCallback(
    (batiment: string): string[] => {
      const sexes = setupInfoData
        .filter((info) => info.building === batiment && info.effectifMisEnPlace > 0)
        .map((info) => info.sex);
      if (sexes.length > 0) return sexes;
      return ["Mâle", "Femelle"];
    },
    [setupInfoData]
  );

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Suivi Technique Hebdomadaire</h1>
        <p>
          Suivi hebdomadaire de l'élevage — Mortalité, consommation, température, interventions
          {isReadOnly && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Consultation seule
            </span>
          )}
        </p>
      </div>

      {showFarmSelector ? (
        <div className="space-y-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Étape 1 — Choisir la ferme</p>
          <p className="text-sm text-muted-foreground">
            {isReadOnly
              ? "Choisissez une ferme pour consulter le suivi technique hebdomadaire."
              : "Choisissez une ferme pour consulter et gérer le suivi technique hebdomadaire."}
          </p>
          {farmsLoading ? (
            <div className="bg-card rounded-lg border border-border shadow-sm p-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Chargement des fermes…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => selectFarm(farm.id)}
                  className="flex items-center gap-4 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground truncate">{farm.name}</div>
                    <div className="text-xs text-muted-foreground">{farm.code}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {farms.length === 0 && !farmsLoading && (
            <p className="text-sm text-muted-foreground">Aucune ferme disponible.</p>
          )}
        </div>
      ) : (
        <>
          {canAccessAllFarms && isValidFarmId && (
            <button
              type="button"
              onClick={clearFarmSelection}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer de ferme
            </button>
          )}

          {!hasLotInUrl || isSelectedLotClosed ? (
            <>
              {isSelectedLotClosed && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4 mb-6">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Ce lot est fermé. Les données ne sont pas accessibles.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Choisissez un autre lot ci-dessous.
                  </p>
                </div>
              )}
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Étape 1 — Lot → Semaine → Bâtiment</p>
              <LotSelectorView
                existingLots={lots}
                lotsWithStatus={lotsWithStatus.length > 0 ? lotsWithStatus : undefined}
                loading={lotsLoading}
                onSelectLot={(lot) => {
                  const status = lotsWithStatus.find((l) => l.lot === lot);
                  if (isClosedLotBlockedForSession(status, lotAccessCtx)) {
                    toast({
                      title: "Lot fermé",
                      description:
                        "Les données de ce lot ne sont pas accessibles pour votre compte. Choisissez un lot ouvert.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setSearchParams(reportingFarmId != null ? { farmId: String(reportingFarmId), lot } : { lot });
                }}
                canCreate={false}
                title="Étape 1 : Choisir un lot"
                description=""
                emptyMessage="Aucun lot. Créez d'abord un lot dans Données mises en place."
              />
            </>
          ) : !hasSemaineInUrl ? (
            <div className="space-y-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Étape 2 : Choisir la semaine</p>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
                <button
                  type="button"
                  onClick={() => setSearchParams(reportingFarmId != null ? { farmId: String(reportingFarmId) } : {})}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de lot
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Choisissez une semaine pour consulter et gérer le suivi technique hebdomadaire.
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
                {SEMAINES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => selectSemaine(s)}
                    className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                  >
                    <Calendar className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <span className="font-semibold text-foreground">{s}</span>
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-2">Ou ajouter une nouvelle semaine</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newSemaineInput}
                    onChange={(e) => setNewSemaineInput(e.target.value)}
                    placeholder="ex. S25, S26..."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const value = newSemaineInput.trim();
                      if (value) {
                        selectSemaine(value);
                        setNewSemaineInput("");
                      }
                    }}
                    disabled={!newSemaineInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
          ) : !hasContentView ? (
            <div className="space-y-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Étape 3 : Choisir un bâtiment</p>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
                <button
                  type="button"
                  onClick={() => setSearchParams(reportingFarmId != null ? { farmId: String(reportingFarmId) } : {})}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de lot
                </button>
                <span className="text-muted-foreground">|</span>
                <span className="text-sm font-medium">Semaine : <strong>{selectedSemaine}</strong></span>
                <button
                  type="button"
                  onClick={clearSemaineSelection}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de semaine
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {allBatiments.map((b) => {
                  const sexes = getSexesForBatiment(b);
                  const canExport = reportingFarmId != null && lotParam.trim() && selectedSemaine;
                  return (
                    <div
                      key={b}
                      className="relative flex items-center gap-2 p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors group"
                    >
                      <button
                        type="button"
                        onClick={() => selectBatiment(b)}
                        className="flex flex-1 min-w-0 items-center justify-center gap-2 text-left"
                      >
                        <Building className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <span className="font-semibold text-foreground truncate">{b}</span>
                      </button>
                      {canExport && (
                        <TooltipProvider>
                          <DropdownMenu>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                                    aria-label={`Télécharger ${b}`}
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="font-medium">
                                Télécharger (Excel ou PDF)
                              </TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end" className="min-w-[180px]">
                              {sexes.map((sex, idx) => (
                                <React.Fragment key={sex}>
                                  {idx > 0 && <DropdownMenuSeparator />}
                                  <DropdownMenuItem
                                    onClick={() => handleExportBatiment(b, sex, "excel")}
                                    className="cursor-pointer gap-2"
                                  >
                                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                                    Excel — {sex}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleExportBatiment(b, sex, "pdf")}
                                    className="cursor-pointer gap-2"
                                  >
                                    <FileText className="h-4 w-4 text-red-600" />
                                    PDF — {sex}
                                  </DropdownMenuItem>
                                </React.Fragment>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TooltipProvider>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-2">Ajouter un bâtiment</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newBatimentInput}
                    onChange={(e) => setNewBatimentInput(e.target.value)}
                    placeholder="ex. B5, B6..."
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={addBatiment}
                    disabled={!newBatimentInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </button>
                </div>
              </div>

              {/* Summary buttons: Résumé hebdomadaire production + Résumé coûts hebdo */}
              <div className="pt-6 border-t border-border flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (reportingFarmId == null) {
                      toast({ title: "Erreur", description: "Ferme non sélectionnée.", variant: "destructive" });
                      return;
                    }
                    navigate(
                      `/suivi-technique-hebdomadaire/resume-production?farmId=${reportingFarmId}&lot=${encodeURIComponent(lotParam)}&semaine=${encodeURIComponent(selectedSemaine)}&batiments=${allBatiments.join(",")}`
                    );
                  }}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left"
                >
                  <BarChart3 className="w-5 h-5 shrink-0 text-primary" />
                  <span className="font-medium text-foreground">Résumé hebdomadaire de la production</span>
                </button>
                {canAccessResumeCouts && (
                  <button
                    type="button"
                    onClick={() => {
                      if (reportingFarmId == null) {
                        toast({ title: "Erreur", description: "Ferme non sélectionnée.", variant: "destructive" });
                        return;
                      }
                      navigate(
                        `/suivi-technique-hebdomadaire/resume-couts?farmId=${reportingFarmId}&lot=${encodeURIComponent(lotParam)}&semaine=${encodeURIComponent(selectedSemaine)}&batiments=${allBatiments.join(",")}`
                      );
                    }}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left"
                  >
                    <DollarSign className="w-5 h-5 shrink-0 text-primary" />
                    <span className="font-medium text-foreground">Résumé des coûts hebdomadaires</span>
                  </button>
                )}
              </div>

            </div>
          ) : loadingSexes ? (
            <div className="space-y-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={clearBatimentSelection}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
                >
                  ← Retour au choix du bâtiment
                </button>
                <p className="text-sm text-muted-foreground">
                  Bâtiment actuel : <strong className="text-foreground">{selectedBatiment}</strong>
                </p>
              </div>
              <div className="bg-card rounded-lg border border-border shadow-sm p-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Chargement de la configuration…</span>
              </div>
            </div>
          ) : initialSex == null ? (
            <div className="space-y-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={clearBatimentSelection}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
                >
                  ← Retour au choix du bâtiment
                </button>
                <p className="text-sm text-muted-foreground">
                  Bâtiment actuel : <strong className="text-foreground">{selectedBatiment}</strong>
                </p>
              </div>
              <p className="text-sm font-medium text-foreground">Choisir le sexe pour ce bâtiment</p>
              {(() => {
                const maleSetupInfo = getSetupInfoForBatimentSex(selectedBatiment, "Mâle");
                const femelleSetupInfo = getSetupInfoForBatimentSex(selectedBatiment, "Femelle");
                const maleHasEffectif = maleSetupInfo && maleSetupInfo.effectifMisEnPlace > 0;
                const femelleHasEffectif = femelleSetupInfo && femelleSetupInfo.effectifMisEnPlace > 0;
                const noSetupInfo = !maleHasEffectif && !femelleHasEffectif;
                
                return (
                  <>
                    {noSetupInfo ? (
                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          <strong>Aucune configuration trouvée.</strong> Veuillez d'abord configurer les données mises en place 
                          (effectif mis en place) dans la page <strong>"Données mises en place"</strong> pour ce bâtiment ({selectedBatiment}).
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate(`/infos-setup?farmId=${reportingFarmId}&lot=${encodeURIComponent(lotParam)}`)}
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
                        >
                          Aller à Données mises en place
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sélectionnez le sexe pour afficher les données de setup et saisir le suivi. 
                        Seuls les sexes avec un effectif mis en place configuré sont disponibles.
                      </p>
                    )}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                      {/* Mâle card */}
                      <button
                        type="button"
                        onClick={() => { 
                          if (maleHasEffectif) {
                            setInitialSex("male"); 
                            setActiveTab("male"); 
                          }
                        }}
                        disabled={!maleHasEffectif}
                        className={`flex flex-col gap-3 p-6 rounded-xl border-2 transition-colors text-left ${
                          maleHasEffectif 
                            ? "border-border bg-card hover:border-primary hover:bg-muted/50 cursor-pointer" 
                            : "border-border/50 bg-muted/30 cursor-not-allowed opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 shrink-0 rounded-full bg-blue-500" />
                          <span className="font-semibold text-foreground">Mâle</span>
                        </div>
                        {maleSetupInfo ? (
                          <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
                            <p><strong>Effectif mis en place:</strong> {formatGroupedNumber(maleSetupInfo.effectifMisEnPlace, 0)}</p>
                            <p><strong>Date mise en place:</strong> {maleSetupInfo.dateMiseEnPlace}</p>
                            <p><strong>Souche:</strong> {maleSetupInfo.souche}</p>
                            <p><strong>Fournisseur:</strong> {maleSetupInfo.origineFournisseur || "—"}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600 dark:text-amber-400 border-t border-border pt-3">
                            Non configuré dans Données mises en place
                          </p>
                        )}
                      </button>
                      
                      {/* Femelle card */}
                      <button
                        type="button"
                        onClick={() => { 
                          if (femelleHasEffectif) {
                            setInitialSex("femelle"); 
                            setActiveTab("femelle"); 
                          }
                        }}
                        disabled={!femelleHasEffectif}
                        className={`flex flex-col gap-3 p-6 rounded-xl border-2 transition-colors text-left ${
                          femelleHasEffectif 
                            ? "border-border bg-card hover:border-primary hover:bg-muted/50 cursor-pointer" 
                            : "border-border/50 bg-muted/30 cursor-not-allowed opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 shrink-0 rounded-full bg-rose-500" />
                          <span className="font-semibold text-foreground">Femelle</span>
                        </div>
                        {femelleSetupInfo ? (
                          <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
                            <p><strong>Effectif mis en place:</strong> {formatGroupedNumber(femelleSetupInfo.effectifMisEnPlace, 0)}</p>
                            <p><strong>Date mise en place:</strong> {femelleSetupInfo.dateMiseEnPlace}</p>
                            <p><strong>Souche:</strong> {femelleSetupInfo.souche}</p>
                            <p><strong>Fournisseur:</strong> {femelleSetupInfo.origineFournisseur || "—"}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600 dark:text-amber-400 border-t border-border pt-3">
                            Non configuré dans Données mises en place
                          </p>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={clearBatimentSelection}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
                  >
                    ← Retour au choix du bâtiment
                  </button>
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
                      <DropdownMenuContent align="start" className="min-w-[180px]">
                        <DropdownMenuItem
                          onClick={async () => {
                            if (!reportingFarmId) return;
                            try {
                              await exportToExcel({
                                farmName: exportFarmName,
                                farmId: reportingFarmId,
                                lot: lotParam,
                                semaine: selectedSemaine,
                                batiment: selectedBatiment,
                                sex: TAB_TO_API_SEX[activeTab],
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
                          onClick={async () => {
                            if (!reportingFarmId) return;
                            try {
                              await exportToPdf({
                                farmName: exportFarmName,
                                farmId: reportingFarmId,
                                lot: lotParam,
                                semaine: selectedSemaine,
                                batiment: selectedBatiment,
                                sex: TAB_TO_API_SEX[activeTab],
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
                <p className="text-sm text-muted-foreground">
                  Bâtiment actuel : <strong className="text-foreground">{selectedBatiment}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
                <button
                  type="button"
                  onClick={() => setSearchParams(reportingFarmId != null ? { farmId: String(reportingFarmId) } : {})}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de lot
                </button>
                <span className="text-muted-foreground">|</span>
                <span className="text-sm font-medium">Semaine : <strong>{selectedSemaine}</strong></span>
                <button
                  type="button"
                  onClick={clearSemaineSelection}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de semaine
                </button>
              </div>

              {/* Tab navigation: only enabled sexes (initial + other if user activated via dialog) */}
              <div className="flex flex-wrap items-center gap-2 mb-6">
                {TABS.filter((tab) => tab.id === initialSex || (tab.id !== initialSex && otherSexEnabled)).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-card border border-border text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tab.dotColor}`} />
                    {tab.label}
                  </button>
                ))}
                {!otherSexEnabled && reportingFarmId != null && (() => {
                  const otherSex = initialSex === "male" ? "Femelle" : "Mâle";
                  const otherSexHasSetupInfo = setupInfoData.some(
                    info => info.building === selectedBatiment && info.sex === otherSex && info.effectifMisEnPlace > 0
                  );
                  
                  return otherSexHasSetupInfo ? (
                    <button
                      type="button"
                      onClick={() => setOtherSexDialogOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      Ajouter l'autre sexe
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                      <UserPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-800 dark:text-amber-200 text-xs">
                        Configurez d'abord {otherSex} dans <strong>Données mises en place</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/infos-setup?farmId=${reportingFarmId}&lot=${encodeURIComponent(lotParam)}`)}
                        className="ml-2 px-2 py-1 rounded-md bg-amber-600 dark:bg-amber-700 text-white text-xs font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
                      >
                        Aller
                      </button>
                    </div>
                  );
                })()}
                {canDeleteSexData && (
                  <button
                    type="button"
                    onClick={() => setDeleteSexDialogOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer les données de ce sexe
                  </button>
                )}
              </div>

              {/* Tab content */}
              {reportingFarmId && selectedSemaine && selectedBatiment && (
                <div className="space-y-4">
                  <SuiviTechniqueBatimentContent
                    farmId={reportingFarmId}
                    lot={lotParam}
                    semaine={canonicalSemaine(selectedSemaine)}
                    batiment={selectedBatiment}
                    activeTab={activeTab}
                    onRefreshStock={refreshStock}
                    stockRefreshKey={stockRefreshKey}
                    showSectionHeader={false}
                    maleSetupInfo={getSetupInfoForBatimentSex(selectedBatiment, "Mâle")}
                    femelleSetupInfo={getSetupInfoForBatimentSex(selectedBatiment, "Femelle")}
                    forceWeeklyReadOnly={true}
                  />
                </div>
              )}

              <AlertDialog open={otherSexDialogOpen} onOpenChange={setOtherSexDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Activer l'autre sexe</AlertDialogTitle>
                    <AlertDialogDescription>
                      Voulez-vous activer le suivi pour{" "}
                      <strong>{initialSex === "male" ? "Femelle" : "Mâle"}</strong> dans ce bâtiment ?{" "}
                      Les données de setup (effectif, souche, fournisseur) seront pré-remplies depuis <strong>Données mises en place</strong>.
                      Les tableaux hebdomadaires (production, consommation, performances) seront vides et devront être renseignés.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={copyToOtherSexLoading}>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleConfirmOtherSex();
                      }}
                      disabled={copyToOtherSexLoading}
                    >
                      {copyToOtherSexLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Activation…
                        </>
                      ) : (
                          "Activer"
                        )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={deleteSexDialogOpen} onOpenChange={setDeleteSexDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer toutes les données de ce sexe</AlertDialogTitle>
                    <AlertDialogDescription>
                      Voulez-vous supprimer les données pour le sexe{" "}
                      <strong>{TAB_TO_API_SEX[activeTab]}</strong> dans ce bâtiment pour la semaine{" "}
                      <strong>{selectedSemaine}</strong> uniquement ? (Suivi hebdo, production, consommation,
                      performances, stock. Le setup est conservé.) Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteSexLoading}>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleConfirmDeleteSex();
                      }}
                      disabled={deleteSexLoading}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteSexLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Suppression…
                        </>
                      ) : (
                          "Supprimer"
                        )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
