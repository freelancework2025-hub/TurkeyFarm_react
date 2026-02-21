import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Calendar, Plus, Building, BarChart3, DollarSign, UserPlus, Trash2 } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api, type FarmResponse } from "@/lib/api";

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

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
 * Permissions: per permission.mdc (all roles; create/update/delete by role).
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

  const { isAdministrateur, isResponsableTechnique, isResponsableFerme, isBackofficeEmployer, canAccessAllFarms, isReadOnly, selectedFarmId: authSelectedFarmId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);

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

  const allBatiments = useMemo(() => [...DEFAULT_BATIMENTS, ...extraBatiments], [extraBatiments]);

  // Load farms for admin/RT
  useEffect(() => {
    if (!showFarmSelector) return;
    setFarmsLoading(true);
    api.farms
      .list()
      .then((list) => setFarms(list))
      .catch(() => setFarms([]))
      .finally(() => setFarmsLoading(false));
  }, [showFarmSelector]);

  const reportingFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  // Fetch configured sexes from backend when batiment is selected
  // This ensures sex tabs persist after page refresh
  useEffect(() => {
    if (!reportingFarmId || !lotParam.trim() || !selectedBatiment) {
      setInitialSex(null);
      setOtherSexEnabled(false);
      return;
    }

    setLoadingSexes(true);
    api.suiviTechniqueSetup
      .getConfiguredSexes({ farmId: reportingFarmId, lot: lotParam.trim(), batiment: selectedBatiment })
      .then((sexes) => {
        if (sexes.length === 0) {
          // No sexes configured yet - show sex chooser
          setInitialSex(null);
          setOtherSexEnabled(false);
        } else if (sexes.length === 1) {
          // One sex configured - show that tab, allow adding the other
          const sex = sexes[0];
          const tabId: TabType = sex === "Mâle" ? "male" : "femelle";
          setInitialSex(tabId);
          setActiveTab(tabId);
          setOtherSexEnabled(false);
        } else {
          // Both sexes configured - show both tabs
          // Default to male tab, but both are enabled
          setInitialSex("male");
          setActiveTab("male");
          setOtherSexEnabled(true);
        }
      })
      .catch(() => {
        // On error, reset to sex chooser
        setInitialSex(null);
        setOtherSexEnabled(false);
      })
      .finally(() => setLoadingSexes(false));
  }, [reportingFarmId, lotParam, selectedBatiment]);

  // Load lots for selected farm
  useEffect(() => {
    if (showFarmSelector || !reportingFarmId || hasLotInUrl) return;
    setLotsLoading(true);
    api.farms
      .lots(reportingFarmId)
      .then((list) => setLots(list ?? []))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, reportingFarmId, hasLotInUrl]);

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
    if (reportingFarmId == null || !lotParam.trim() || !selectedBatiment) return;
    const sexToDelete = TAB_TO_API_SEX[activeTab];
    setDeleteSexLoading(true);
    try {
      await api.suiviTechniqueSetup.deleteAllDataForSex({
        farmId: reportingFarmId,
        lot: lotParam.trim(),
        batiment: selectedBatiment,
        sex: sexToDelete,
      });
      setDeleteSexDialogOpen(false);
      refreshStock();
      const sexes = await api.suiviTechniqueSetup.getConfiguredSexes({
        farmId: reportingFarmId,
        lot: lotParam.trim(),
        batiment: selectedBatiment,
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
        description: `Toutes les données pour le sexe « ${sexToDelete} » ont été supprimées pour ce bâtiment.`,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de supprimer les données.",
        variant: "destructive",
      });
    } finally {
      setDeleteSexLoading(false);
    }
  }, [reportingFarmId, lotParam, selectedBatiment, activeTab, refreshStock, toast]);

  const canDeleteSexData = isResponsableTechnique || isAdministrateur;

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

          {!hasLotInUrl ? (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Étape 1 — Lot → Semaine → Bâtiment</p>
              <LotSelectorView
                existingLots={lots}
                loading={lotsLoading}
                onSelectLot={(lot) => setSearchParams(reportingFarmId != null ? { farmId: String(reportingFarmId), lot } : { lot })}
                onNewLot={(lot) => setSearchParams(reportingFarmId != null ? { farmId: String(reportingFarmId), lot } : { lot })}
                canCreate={!isReadOnly}
                title="Étape 1 : Choisir un lot"
                emptyMessage="Aucun lot. Créez d'abord un effectif mis en place (placement) avec un numéro de lot."
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
                {allBatiments.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => selectBatiment(b)}
                    className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                  >
                    <Building className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <span className="font-semibold text-foreground">{b}</span>
                  </button>
                ))}
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
                <button
                  type="button"
                  onClick={() => toast({ title: "À venir", description: "Résumé des coûts hebdomadaires sera disponible prochainement." })}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left"
                >
                  <DollarSign className="w-5 h-5 shrink-0 text-primary" />
                  <span className="font-medium text-foreground">Résumé des coûts hebdomadaires</span>
                </button>
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
              <p className="text-sm text-muted-foreground">
                Sélectionnez le sexe (Mâle ou Femelle) pour afficher et saisir le suivi. Vous pourrez ajouter l'autre sexe plus tard en recopiant les valeurs calculées.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 max-w-md">
                <button
                  type="button"
                  onClick={() => { setInitialSex("male"); setActiveTab("male"); }}
                  className="flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                >
                  <span className="h-4 w-4 shrink-0 rounded-full bg-blue-500" />
                  <span className="font-semibold text-foreground">Mâle</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setInitialSex("femelle"); setActiveTab("femelle"); }}
                  className="flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                >
                  <span className="h-4 w-4 shrink-0 rounded-full bg-rose-500" />
                  <span className="font-semibold text-foreground">Femelle</span>
                </button>
              </div>
            </div>
          ) : (
            <>
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
                {!otherSexEnabled && reportingFarmId != null && (
                  <button
                    type="button"
                    onClick={() => setOtherSexDialogOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    Ajouter l'autre sexe
                  </button>
                )}
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
                    semaine={selectedSemaine}
                    batiment={selectedBatiment}
                    activeTab={activeTab}
                    onRefreshStock={refreshStock}
                    stockRefreshKey={stockRefreshKey}
                    showSectionHeader={false}
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
                      <strong>Toutes les données seront vides</strong> (setup, effectif de départ, hebdo, production,
                      consommation, performances) — vous devrez tout renseigner. Seul le tableau Stock affichera les
                      valeurs du premier sexe dans ce bâtiment.
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
                          "Activer (données vides)"
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
                      Voulez-vous supprimer <strong>toutes les données</strong> pour le sexe{" "}
                      <strong>{TAB_TO_API_SEX[activeTab]}</strong> dans ce bâtiment ? (Setup, suivi hebdo, production,
                      consommation, performances.) Cette action est irréversible.
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
