/**
 * Helper functions for exporting complete Suivi Technique data.
 * - Uses display data (no recalculation) for WeeklyTrackingTable
 * - Fetches other tables (Production, Consumption, Performance, Stock) from API
 * This ensures exports match the page display exactly while including all sections.
 */

import { 
  exportToExcelFromDisplayData, 
  exportToPdfFromDisplayData, 
  type SuiviTechniqueBatimentExportParams,
  type WeeklyTrackingDisplayData 
} from "./suiviTechniqueBatimentExport";
import { api } from "./api";

/**
 * Export complete Suivi Technique data to Excel.
 * - Section 3 (Suivi hebdomadaire): Uses display data from WeeklyTrackingTable (no recalculation)
 * - Other sections: Fetched from API (Production, Consumption, Performance, Stock)
 * Includes CONSO ALIMENT Kg/J in the Consommation section.
 */
export async function exportWeeklyTrackingToExcel(
  params: SuiviTechniqueBatimentExportParams,
  displayData: WeeklyTrackingDisplayData
): Promise<void> {
  // Fetch setup data if not already included
  let setupData = displayData.setup;
  if (!setupData) {
    try {
      setupData = await api.suiviTechniqueSetup.getBySex({
        farmId: params.farmId,
        lot: params.lot,
        semaine: params.semaine,
        sex: params.sex,
        batiment: params.batiment,
      });
    } catch (error) {
      console.warn("Could not fetch setup data for export:", error);
      setupData = null;
    }
  }

  const completeDisplayData = {
    ...displayData,
    setup: setupData,
  };

  await exportToExcelFromDisplayData(params, completeDisplayData);
}

/**
 * Export complete Suivi Technique data to PDF.
 * - Section 3 (Suivi hebdomadaire): Uses display data from WeeklyTrackingTable (no recalculation)
 * - Other sections: Fetched from API (Production, Consumption, Performance, Stock)
 * Includes CONSO ALIMENT Kg/J in the Consommation section.
 */
export async function exportWeeklyTrackingToPdf(
  params: SuiviTechniqueBatimentExportParams,
  displayData: WeeklyTrackingDisplayData
): Promise<void> {
  // Fetch setup data if not already included
  let setupData = displayData.setup;
  if (!setupData) {
    try {
      setupData = await api.suiviTechniqueSetup.getBySex({
        farmId: params.farmId,
        lot: params.lot,
        semaine: params.semaine,
        sex: params.sex,
        batiment: params.batiment,
      });
    } catch (error) {
      console.warn("Could not fetch setup data for export:", error);
      setupData = null;
    }
  }

  const completeDisplayData = {
    ...displayData,
    setup: setupData,
  };

  await exportToPdfFromDisplayData(params, completeDisplayData);
}

/**
 * Example usage in a parent component:
 * 
 * ```tsx
 * function ParentComponent() {
 *   const [exportFunctions, setExportFunctions] = useState<any>(null);
 * 
 *   const handleExportExcel = async () => {
 *     if (exportFunctions) {
 *       const displayData = exportFunctions.getExportDisplayData();
 *       await exportWeeklyTrackingToExcel({
 *         farmName: "My Farm",
 *         farmId: 1,
 *         lot: "147",
 *         semaine: "S1",
 *         batiment: "B1",
 *         sex: "Mâle"
 *       }, displayData);
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handleExportExcel}>Export Excel</button>
 *       <WeeklyTrackingTable
 *         farmId={1}
 *         lot="147"
 *         semaine="S1"
 *         sex="Mâle"
 *         batiment="B1"
 *         onExportReady={setExportFunctions}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */