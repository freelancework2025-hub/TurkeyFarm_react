import { useState, useEffect, useCallback } from "react";
import SuiviSetupForm from "@/components/suivi-technique/SuiviSetupForm";
import WeeklyTrackingTable from "@/components/suivi-technique/WeeklyTrackingTable";
import ProductionTrackingTable from "@/components/suivi-technique/ProductionTrackingTable";
import ConsumptionTrackingTable from "@/components/suivi-technique/ConsumptionTrackingTable";
import PerformanceTrackingTable from "@/components/suivi-technique/PerformanceTrackingTable";
import StockTrackingTable from "@/components/suivi-technique/StockTrackingTable";
import { api, type SuiviTechniqueSetupResponse, type SetupInfoResponse } from "@/lib/api";

export type TabType = "male" | "femelle";

export interface SuiviTechniqueBatimentContentProps {
  farmId: number;
  lot: string;
  semaine: string;
  batiment: string;
  activeTab: TabType;
  onRefreshStock: () => void;
  stockRefreshKey: number;
  /** When true, show a compact section header (e.g. when rendering multiple batiments). */
  showSectionHeader?: boolean;
  /** Setup info from InfosSetup page for pre-populating forms */
  maleSetupInfo?: SetupInfoResponse | null;
  femelleSetupInfo?: SetupInfoResponse | null;
  /** Force Suivi Hebdomadaire table to be read-only for everyone. */
  forceWeeklyReadOnly?: boolean;
}

/**
 * Renders suivi technique content for ONE batiment only (Lot → Semaine → Batiment flow).
 * All tables (Setup, Hebdo, Production, Consommation, Performances, Stock) are scoped to this batiment.
 * If nothing is saved yet for this batiment, tables appear empty and ready to fill.
 * Used by SuiviTechniqueHebdomadaire after user selects a batiment; user cannot change batiment here (must use "Retour au choix du bâtiment").
 */
export default function SuiviTechniqueBatimentContent({
  farmId,
  lot,
  semaine,
  batiment,
  activeTab,
  onRefreshStock,
  stockRefreshKey,
  showSectionHeader = false,
  maleSetupInfo: propMaleSetupInfo,
  femelleSetupInfo: propFemelleSetupInfo,
  forceWeeklyReadOnly = false,
}: SuiviTechniqueBatimentContentProps) {
  const [maleSetup, setMaleSetup] = useState<SuiviTechniqueSetupResponse | null>(null);
  const [femelleSetup, setFemelleSetup] = useState<SuiviTechniqueSetupResponse | null>(null);

  const loadSetups = useCallback(() => {
    api.suiviTechniqueSetup
      .getBySex({ farmId, lot, semaine, sex: "Mâle", batiment })
      .then((r) => setMaleSetup(r ?? null))
      .catch(() => setMaleSetup(null));
    api.suiviTechniqueSetup
      .getBySex({ farmId, lot, semaine, sex: "Femelle", batiment })
      .then((r) => setFemelleSetup(r ?? null))
      .catch(() => setFemelleSetup(null));
  }, [farmId, lot, semaine, batiment]);

  useEffect(() => {
    loadSetups();
  }, [loadSetups]);

  const handleMaleSetupSaved = (setup: SuiviTechniqueSetupResponse) => {
    setMaleSetup(setup);
  };
  const handleFemelleSetupSaved = (setup: SuiviTechniqueSetupResponse) => {
    setFemelleSetup(setup);
  };

  const getMaleEffectif = () =>
    maleSetup?.effectifMisEnPlace ?? propMaleSetupInfo?.effectifMisEnPlace ?? undefined;
  const getFemelleEffectif = () =>
    femelleSetup?.effectifMisEnPlace ?? propFemelleSetupInfo?.effectifMisEnPlace ?? undefined;

  const content = (
    <>
      {activeTab === "male" && (
        <div className="space-y-6">
          <SuiviSetupForm
            key="setup-Mâle"
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Mâle"
            selectedBatiment={batiment}
            onSetupSaved={handleMaleSetupSaved}
            onSaveSuccess={onRefreshStock}
            presetSetupInfo={propMaleSetupInfo ?? undefined}
          />
          <WeeklyTrackingTable
            key={`hebdo-${farmId}-${lot}-${semaine}-${batiment}-Mâle`}
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Mâle"
            batiment={batiment}
            effectifInitial={getMaleEffectif()}
            onSaveSuccess={onRefreshStock}
            forceReadOnly={forceWeeklyReadOnly}
          />
          <ProductionTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Mâle"
            batiment={batiment}
            onSaveSuccess={onRefreshStock}
            refreshKey={stockRefreshKey}
          />
          <ConsumptionTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Mâle"
            batiment={batiment}
            onSaveSuccess={onRefreshStock}
            refreshKey={stockRefreshKey}
          />
          <PerformanceTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Mâle"
            batiment={batiment}
            refreshKey={stockRefreshKey}
          />
          <StockTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Mâle"
            batiment={batiment}
            refreshKey={stockRefreshKey}
            onSaveSuccess={onRefreshStock}
          />
        </div>
      )}

      {activeTab === "femelle" && (
        <div className="space-y-6">
          <SuiviSetupForm
            key="setup-Femelle"
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Femelle"
            selectedBatiment={batiment}
            onSetupSaved={handleFemelleSetupSaved}
            onSaveSuccess={onRefreshStock}
            presetSetupInfo={propFemelleSetupInfo ?? undefined}
          />
          <WeeklyTrackingTable
            key={`hebdo-${farmId}-${lot}-${semaine}-${batiment}-Femelle`}
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Femelle"
            batiment={batiment}
            effectifInitial={getFemelleEffectif()}
            onSaveSuccess={onRefreshStock}
            forceReadOnly={forceWeeklyReadOnly}
          />
          <ProductionTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Femelle"
            batiment={batiment}
            onSaveSuccess={onRefreshStock}
            refreshKey={stockRefreshKey}
          />
          <ConsumptionTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Femelle"
            batiment={batiment}
            onSaveSuccess={onRefreshStock}
            refreshKey={stockRefreshKey}
          />
          <PerformanceTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Femelle"
            batiment={batiment}
            refreshKey={stockRefreshKey}
          />
          <StockTrackingTable
            farmId={farmId}
            lot={lot}
            semaine={semaine}
            sex="Femelle"
            batiment={batiment}
            refreshKey={stockRefreshKey}
            onSaveSuccess={onRefreshStock}
          />
        </div>
      )}
    </>
  );

  if (showSectionHeader) {
    return (
      <section className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 border-b border-border pb-2">
          <span className="w-3 h-3 rounded-full bg-primary" />
          Bâtiment {batiment}
        </h3>
        {content}
      </section>
    );
  }

  return <div className="space-y-6">{content}</div>;
}
