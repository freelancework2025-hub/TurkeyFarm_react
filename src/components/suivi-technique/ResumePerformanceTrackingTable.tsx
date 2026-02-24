/**
 * Read-only performance/consumption summary table for the Résumé hebdomadaire page.
 * Shows aggregated values across all bâtiments and both sexes for the chosen week:
 * - CONSOMME ALIMENT Semaine choisi (sum)
 * - CUMUL ALIMENT CONSOMME semaine choisi (sum)
 * - INDICE EAU/ALIMENT = sum CONSOMME ALIMENT / total eau semaine
 */
export interface ResumePerformanceTrackingTableProps {
  /** Semaine label (e.g. S1) for the header */
  semaine: string;
  /** Sum of CONSOMME ALIMENT (semaine choisie) over all batiments and both sexes (kg) */
  consoAlimentSemaineSum: number | null;
  /** Sum of CUMUL ALIMENT CONSOMME over all batiments and both sexes (kg) */
  cumulAlimentConsommeSum: number | null;
  /** INDICE EAU/ALIMENT = consoAlimentSemaineSum / totalWaterSemaineL (when totalWater > 0) */
  indiceEauAliment: number | null;
  /** POIDS VIF PRODUIT EN KG (sum over all batiments and sexes) */
  poidsVifProduitKg: number | null;
  /** Total NB from Suivi de production — Tous bâtiments */
  totalNbreSuiviProduction: number | null;
  /** EFFECTIF RESTANT FIN DE SEMAINE (computed) */
  effectifRestantFinSemaine: number | null;
  /** Last value of cumul mortalité % (from weekly table, last day of week) for VIABILITE = 100% − this */
  lastMortaliteCumulPct: number | null;
}

function formatVal(value: number | null | undefined, unit?: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const s = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}

export default function ResumePerformanceTrackingTable({
  semaine,
  consoAlimentSemaineSum,
  cumulAlimentConsommeSum,
  indiceEauAliment,
  poidsVifProduitKg,
  totalNbreSuiviProduction,
  effectifRestantFinSemaine,
  lastMortaliteCumulPct,
}: ResumePerformanceTrackingTableProps) {
  const denom =
    (totalNbreSuiviProduction ?? 0) + (effectifRestantFinSemaine ?? 0);
  const poidsMoyenG =
    denom > 0 && poidsVifProduitKg != null && Number.isFinite(poidsVifProduitKg)
      ? (poidsVifProduitKg / denom) * 1000
      : null;

  const indiceConsommation =
    poidsVifProduitKg != null &&
    Number.isFinite(poidsVifProduitKg) &&
    poidsVifProduitKg > 0 &&
    cumulAlimentConsommeSum != null &&
    Number.isFinite(cumulAlimentConsommeSum)
      ? cumulAlimentConsommeSum / poidsVifProduitKg
      : null;

  const gmqGParJour =
    poidsMoyenG != null && Number.isFinite(poidsMoyenG) ? poidsMoyenG / 7 : null;

  const viabilite =
    lastMortaliteCumulPct != null && Number.isFinite(lastMortaliteCumulPct)
      ? 100 - lastMortaliteCumulPct
      : null;

  const consoAlimentKgParJ =
    consoAlimentSemaineSum != null && Number.isFinite(consoAlimentSemaineSum)
      ? consoAlimentSemaineSum / 7
      : null;

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
          Suivi de PERFORMANCES — Résumé consommation — {semaine}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-semibold text-foreground w-[280px]">
                INDICATEUR
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-l border-border">
                VALEUR
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border bg-card">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                CONSOMME ALIMENT {semaine}
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(consoAlimentSemaineSum, "kg")}
              </td>
            </tr>
            <tr className="border-b border-border bg-muted/10">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                CUMUL ALIMENT CONSOMME {semaine}
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(cumulAlimentConsommeSum, "kg")}
              </td>
            </tr>
            <tr className="border-b border-border bg-card">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                INDICE EAU/ALIMENT
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(indiceEauAliment)}
              </td>
            </tr>
            <tr className="border-b border-border bg-muted/10">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                POIDS MOYEN (g)
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(poidsMoyenG, "g")}
              </td>
            </tr>
            <tr className="border-b border-border bg-card">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                I.CONSOMMATION
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(indiceConsommation)}
              </td>
            </tr>
            <tr className="border-b border-border bg-muted/10">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                GMQ (g/jour)
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(gmqGParJour, "g/jour")}
              </td>
            </tr>
            <tr className="border-b border-border bg-card">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                VIABILITE
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(viabilite, "%")}
              </td>
            </tr>
            <tr className="border-b border-border bg-muted/10">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                CONSO ALIMENT Kg/J
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatVal(consoAlimentKgParJ, "Kg/J")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
