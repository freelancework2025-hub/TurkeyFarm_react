import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type SuiviTechniqueSetupResponse, type SuiviTechniqueHebdoResponse } from "@/lib/api";

const SEXES = ["Mâle", "Femelle"] as const;

export interface WeeklyProductionSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  farmId: number;
  lot: string;
  semaine: string;
  allBatiments: string[];
}

interface AggregatedRow {
  recordDate: string;
  ageJour: number | null;
  mortaliteNbre: number;
  mortalitePct: string;
  mortaliteCumul: number;
  mortaliteCumulPct: string;
  consoEauL: number;
  tempMin: number | null;
  tempMax: number | null;
}

export default function WeeklyProductionSummaryModal({
  open,
  onOpenChange,
  farmId,
  lot,
  semaine,
  allBatiments,
}: WeeklyProductionSummaryModalProps) {
  const [loading, setLoading] = useState(false);
  const [setups, setSetups] = useState<Map<string, SuiviTechniqueSetupResponse | null>>(new Map());
  const [hebdoLists, setHebdoLists] = useState<Map<string, SuiviTechniqueHebdoResponse[]>>(new Map());

  useEffect(() => {
    if (!open || !farmId || !lot || !semaine || allBatiments.length === 0) return;

    const key = (batiment: string, sex: string) => `${batiment}|${sex}`;

    setLoading(true);
    const setupPromises: Promise<void>[] = [];
    const hebdoPromises: Promise<void>[] = [];

    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        setupPromises.push(
          api.suiviTechniqueSetup
            .getBySex({ farmId, lot, sex, batiment })
            .then((r) => setSetups((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setSetups((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
        hebdoPromises.push(
          api.suiviTechniqueHebdo
            .list({ farmId, lot, sex, batiment, semaine })
            .then((list) => setHebdoLists((prev) => new Map(prev).set(key(batiment, sex), list ?? [])))
            .catch(() => setHebdoLists((prev) => new Map(prev).set(key(batiment, sex), [])))
        );
      }
    }

    Promise.all([...setupPromises, ...hebdoPromises])
      .finally(() => setLoading(false));
  }, [open, farmId, lot, semaine, allBatiments]);

  const key = (batiment: string, sex: string) => `${batiment}|${sex}`;

  const aggregatedSetup = useMemo(() => {
    let totalEffectif = 0;
    let firstDate: string | null = null;
    let firstSouche: string | null = null;

    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const setup = setups.get(key(batiment, sex));
        if (setup?.effectifMisEnPlace != null) totalEffectif += setup.effectifMisEnPlace;
        if (setup?.dateMiseEnPlace) firstDate = firstDate ?? setup.dateMiseEnPlace;
        if (setup?.souche) firstSouche = firstSouche ?? setup.souche;
      }
    }

    return {
      effectifMisEnPlace: totalEffectif,
      dateMiseEnPlace: firstDate ?? "Définie automatiquement",
      souche: firstSouche ?? "Définie automatiquement",
    };
  }, [setups, allBatiments]);

  const totalEffectifDepart = useMemo(() => {
    let sum = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const list = hebdoLists.get(key(batiment, sex)) ?? [];
        const firstWithEffectif = list.find((r) => r.effectifDepart != null);
        if (firstWithEffectif?.effectifDepart != null) sum += firstWithEffectif.effectifDepart;
      }
    }
    return sum;
  }, [hebdoLists, allBatiments]);

  const aggregatedRows = useMemo((): AggregatedRow[] => {
    const byDate = new Map<string, { mortaliteNbre: number; consoEauL: number; ageJour: number | null; tempMin: number | null; tempMax: number | null }>();

    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const list = hebdoLists.get(key(batiment, sex)) ?? [];
        for (const r of list) {
          if (!r.recordDate) continue;
          const existing = byDate.get(r.recordDate) ?? {
            mortaliteNbre: 0,
            consoEauL: 0,
            ageJour: null as number | null,
            tempMin: null as number | null,
            tempMax: null as number | null,
          };
          existing.mortaliteNbre += r.mortaliteNbre ?? 0;
          existing.consoEauL += r.consoEauL ?? 0;
          if (r.ageJour != null) existing.ageJour = existing.ageJour != null ? Math.min(existing.ageJour, r.ageJour) : r.ageJour;
          if (r.tempMin != null) existing.tempMin = existing.tempMin != null ? Math.min(existing.tempMin, r.tempMin) : r.tempMin;
          if (r.tempMax != null) existing.tempMax = existing.tempMax != null ? Math.max(existing.tempMax, r.tempMax) : r.tempMax;
          byDate.set(r.recordDate, existing);
        }
      }
    }

    const sortedDates = Array.from(byDate.keys()).sort();
    const effectif = totalEffectifDepart > 0 ? totalEffectifDepart : 1;
    let runningCumul = 0;

    return sortedDates.map((recordDate) => {
      const row = byDate.get(recordDate)!;
      runningCumul += row.mortaliteNbre;
      const mortalitePct = ((row.mortaliteNbre / effectif) * 100).toFixed(2);
      const mortaliteCumulPct = ((runningCumul / effectif) * 100).toFixed(2);
      return {
        recordDate,
        ageJour: row.ageJour,
        mortaliteNbre: row.mortaliteNbre,
        mortalitePct,
        mortaliteCumul: runningCumul,
        mortaliteCumulPct,
        consoEauL: row.consoEauL,
        tempMin: row.tempMin,
        tempMax: row.tempMax,
      };
    });
  }, [hebdoLists, allBatiments, totalEffectifDepart]);

  const weeklyTotals = useMemo(() => {
    const totalMortality = aggregatedRows.reduce((s, r) => s + r.mortaliteNbre, 0);
    const totalWater = aggregatedRows.reduce((s, r) => s + r.consoEauL, 0);
    return { totalMortality, totalWater };
  }, [aggregatedRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Résumé hebdomadaire de la production</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Chargement des données…</span>
          </div>
        ) : (
          <div className="overflow-y-auto space-y-6 pr-2">
            {/* 1. Infos de Setup — combined */}
            <div className="bg-card rounded-lg border border-border shadow-sm p-5">
              <h3 className="text-base font-display font-bold text-foreground mb-3">
                Infos de Setup — Configuration initiale pour le lot {lot}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Date de mise en place</label>
                  <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground">
                    {aggregatedSetup.dateMiseEnPlace}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Souche</label>
                  <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground">
                    {aggregatedSetup.souche}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Effectif mis en place</label>
                  <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-semibold text-foreground">
                    {aggregatedSetup.effectifMisEnPlace}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Effectif départ de la semaine */}
            <div className="inline-flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Effectif départ de {semaine}</label>
                <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-semibold text-foreground w-28">
                  {totalEffectifDepart}
                </div>
              </div>
            </div>

            {/* 3. Combined weekly tracking table (read-only) */}
            <div className="bg-card rounded-lg border border-border shadow-sm">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-base font-display font-bold text-foreground">
                  Suivi Hebdomadaire — Tous bâtiments — {semaine}
                </h3>
                <p className="text-xs text-muted-foreground">Lot {lot} — Données agrégées (Mâle + Femelle, tous bâtiments)</p>
              </div>
              <div className="overflow-x-auto rounded-b-lg border-border">
                <table className="w-full min-w-[900px] text-sm border-collapse bg-card table-fixed">
                  <colgroup>
                    <col className="w-[100px]" />
                    <col className="w-[70px]" />
                    <col className="w-[72px]" />
                    <col className="w-[56px]" />
                    <col className="w-[56px]" />
                    <col className="w-[56px]" />
                    <col className="w-[84px]" />
                    <col className="w-12" />
                    <col className="w-12" />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/80 border-b-2 border-border">
                      <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">DATE</th>
                      <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">ÂGE EN J</th>
                      <th colSpan={4} className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">MORTALITÉ</th>
                      <th className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">CONSO. EAU (L)</th>
                      <th colSpan={2} className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">T°</th>
                    </tr>
                    <tr className="bg-muted/60 border-b border-border">
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">NBRE</th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">%</th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">CUMUL</th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">%</th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border w-12">MIN</th>
                      <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border w-12">MAX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                          Aucune donnée hebdomadaire pour cette semaine.
                        </td>
                      </tr>
                    ) : (
                      aggregatedRows.map((row, index) => (
                        <tr
                          key={row.recordDate}
                          className={`border-b border-border ${index % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                        >
                          <td className="border-r border-border px-1 py-1">{row.recordDate}</td>
                          <td className="border-r border-border px-1 py-1 text-center tabular-nums">
                            {row.ageJour != null ? row.ageJour : "—"}
                          </td>
                          <td className="border-r border-border px-1 py-1 text-center tabular-nums">{row.mortaliteNbre}</td>
                          <td className="border-r border-border px-1 py-1 text-center text-muted-foreground tabular-nums">
                            {row.mortalitePct ? `${row.mortalitePct.replace(".", ",")} %` : "—"}
                          </td>
                          <td className="border-r border-border px-1 py-1 text-center tabular-nums">{row.mortaliteCumul}</td>
                          <td className="border-r border-border px-1 py-1 text-center text-muted-foreground tabular-nums">
                            {row.mortaliteCumulPct ? `${row.mortaliteCumulPct.replace(".", ",")} %` : "—"}
                          </td>
                          <td className="border-r border-border px-1 py-1 text-center tabular-nums">{row.consoEauL.toFixed(1).replace(".", ",")}</td>
                          <td className="border-r border-border px-1 py-1 text-center tabular-nums">
                            {row.tempMin != null ? row.tempMin : "—"}
                          </td>
                          <td className="border-r border-border px-1 py-1 text-center tabular-nums">
                            {row.tempMax != null ? row.tempMax : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                      <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border">TOTAL {semaine}</td>
                      <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-destructive">
                        {weeklyTotals.totalMortality}
                      </td>
                      <td className="px-1.5 py-2 text-center text-muted-foreground border-r border-border tabular-nums">
                        {totalEffectifDepart > 0
                          ? `${((weeklyTotals.totalMortality / totalEffectifDepart) * 100).toFixed(2).replace(".", ",")} %`
                          : "—"}
                      </td>
                      <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border"></td>
                      <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-muted-foreground">
                        {weeklyTotals.totalWater.toFixed(1).replace(".", ",")} L
                      </td>
                      <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
