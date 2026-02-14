import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import EffectifMisEnPlace from "@/components/reporting/EffectifMisEnPlace";
import DailyReportTable from "@/components/reporting/DailyReportTable";
import SavedDaysOverview from "@/components/reporting/SavedDaysOverview";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FarmResponse } from "@/lib/api";

export default function ReportingJournalier() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);

  const { isAdministrateur, isResponsableTechnique, isBackofficeEmployer, canAccessAllFarms, isReadOnly } = useAuth();
  // Admin, Responsable technique and Backoffice: see farm list first; on click, only that farm's data is shown.
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);

  const [viewMode, setViewMode] = useState<"overview" | "form">("overview");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
    setViewMode("form");
  };

  const handleNewReport = () => {
    setSelectedDate(today);
    setViewMode("form");
  };

  const handleBackToOverview = () => {
    setViewMode("overview");
    setSelectedDate(null);
  };

  const reportingFarmId = isValidFarmId ? selectedFarmId : undefined;

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Reporting Journalier</h1>
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

          {viewMode === "overview" ? (
            <div className="space-y-6">
              <SavedDaysOverview
                onSelectDay={handleSelectDay}
                onNewReport={handleNewReport}
                farmId={reportingFarmId}
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
              <EffectifMisEnPlace farmId={reportingFarmId} />
              <DailyReportTable
                key={selectedDate ?? undefined}
                initialDate={selectedDate ?? undefined}
                farmId={reportingFarmId}
              />
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
