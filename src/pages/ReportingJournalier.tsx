import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import EffectifMisEnPlace from "@/components/reporting/EffectifMisEnPlace";
import DailyReportTable from "@/components/reporting/DailyReportTable";
import SavedDaysOverview from "@/components/reporting/SavedDaysOverview";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FarmResponse, type LotWithStatusResponse, getStoredSelectedFarm } from "@/lib/api";
import { exportToExcel, exportToPdf } from "@/lib/reportingJournalierExport";
import { useToast } from "@/hooks/use-toast";

/**
 * Reporting Journalier — effectif mis en place and rapport journalier per day.
 * Permissions: DailyReportTable and EffectifMisEnPlace use canCreate/canUpdate; RESPONSABLE_FERME: saved rows read-only.
 */
export default function ReportingJournalier() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);
  const hasLotInUrl = lotParam.trim() !== "";

  const { isAdministrateur, isResponsableTechnique, isBackofficeEmployer, canAccessAllFarms, isReadOnly, selectedFarmId: authSelectedFarmId } = useAuth();
  // Admin, Responsable technique and Backoffice: see farm list first; on click, only that farm's data is shown.
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const { toast } = useToast();
  const isSelectedLotClosed = Boolean(hasLotInUrl && lotParam.trim() && lotsWithStatus.find((l) => l.lot === lotParam.trim())?.closed);

  const [viewMode, setViewMode] = useState<"overview" | "form">("overview");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isNewReport, setIsNewReport] = useState(false);

  const today = new Date().toISOString().split("T")[0];

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
  
  // For URL parameters, always use a farmId when available to ensure proper multi-tenant data isolation
  const urlFarmId = reportingFarmId ?? authSelectedFarmId;

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

  const selectFarm = useCallback(
    (id: number) => {
      setSearchParams({ farmId: String(id) });
    },
    [setSearchParams]
  );

  const clearFarmSelection = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const handleSelectDay = (date: string) => {
    setSelectedDate(date);
    setIsNewReport(false);
    setViewMode("form");
  };

  const handleNewReport = () => {
    setSelectedDate(null);  // Don't set a specific date - let DailyReportTable calculate the next day
    setIsNewReport(true);
    setViewMode("form");
  };

  const handleBackToOverview = () => {
    setViewMode("overview");
    setSelectedDate(null);
    setIsNewReport(false);
  };

  const canShowExport = reportingFarmId != null && hasLotInUrl && !isSelectedLotClosed && !showFarmSelector;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === reportingFarmId)?.name ?? "Ferme")
      : (getStoredSelectedFarm()?.name ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport) return;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: lotParam,
        farmId: reportingFarmId ?? undefined,
        selectedDate: viewMode === "form" ? selectedDate ?? undefined : undefined,
      });
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = async () => {
    if (!canShowExport) return;
    try {
      await exportToPdf({
        farmName: exportFarmName,
        lot: lotParam,
        farmId: reportingFarmId ?? undefined,
        selectedDate: viewMode === "form" ? selectedDate ?? undefined : undefined,
      });
      toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier PDF.", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>Reporting Journalier</h1>
          {canShowExport && (
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
                  <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Télécharger Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf} className="cursor-pointer gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    Télécharger PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          )}
        </div>
        <p>
          Suivi quotidien de l'élevage — Effectif initial et rapport journalier
          {isReadOnly && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Consultation seule
            </span>
          )}
        </p>
      </div>

      {showFarmSelector ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {isReadOnly
              ? "Choisissez une ferme pour consulter les rapports journaliers. Vous pouvez changer de ferme sans vous déconnecter."
              : "Choisissez une ferme pour consulter et gérer les rapports journaliers. Vous pouvez changer de ferme sans vous déconnecter."}
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
              <LotSelectorView
                existingLots={lots}
                lotsWithStatus={lotsWithStatus.length > 0 ? lotsWithStatus : undefined}
                loading={lotsLoading}
                onSelectLot={(lot) => {
                  const status = lotsWithStatus.find((l) => l.lot === lot);
                  if (status?.closed) {
                    toast({
                      title: "Lot fermé",
                      description: "Les données de ce lot ne sont pas accessibles. Choisissez un lot ouvert.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId), lot } : { lot });
                }}
                onNewLot={(lot) => setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId), lot } : { lot })}
                canCreate={!isReadOnly}
                title="Choisir un lot — Reporting Journalier"
                emptyMessage="Aucun lot. Créez d'abord un effectif mis en place (placement) avec un numéro de lot."
              />
            </>
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
            <button
              type="button"
              onClick={() => setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId) } : {})}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Changer de lot
            </button>
          </div>

          {viewMode === "overview" ? (
            <div className="space-y-6">
              <SavedDaysOverview
                onSelectDay={handleSelectDay}
                onNewReport={handleNewReport}
                farmId={reportingFarmId}
                lot={lotParam || undefined}
              />
            </div>
          ) : (
            <div className="space-y-8">
              <button
                type="button"
                onClick={handleBackToOverview}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour aux jours enregistrés
              </button>
              <EffectifMisEnPlace farmId={reportingFarmId} lot={lotParam || undefined} />
              <DailyReportTable
                key={lotParam ?? "no-lot"}
                initialDate={selectedDate ?? undefined}
                farmId={reportingFarmId}
                lot={lotParam || undefined}
                isNewReport={isNewReport}
                onSaveSuccess={(date) => {
                  setSelectedDate(date);
                  setIsNewReport(false);
                }}
              />
            </div>
          )}
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
