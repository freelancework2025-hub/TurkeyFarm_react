import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  api,
  type SuiviTechniqueSetupResponse,
  type SuiviTechniqueHebdoResponse,
  type SuiviProductionHebdoResponse,
  type SuiviStockResponse,
} from "@/lib/api";

const SEXES = ["Mâle", "Femelle"] as const;

export interface WeeklyProductionSummaryContentProps {
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
}

export default function WeeklyProductionSummaryContent({
  farmId,
  lot,
  semaine,
  allBatiments,
}: WeeklyProductionSummaryContentProps) {
  const [loading, setLoading] = useState(true);
  const [setups, setSetups] = useState<Map<string, SuiviTechniqueSetupResponse | null>>(new Map());
  const [hebdoLists, setHebdoLists] = useState<Map<string, SuiviTechniqueHebdoResponse[]>>(new Map());
  const [productionByKey, setProductionByKey] = useState<Map<string, SuiviProductionHebdoResponse | null>>(new Map());
  const [stockByKey, setStockByKey] = useState<Map<string, SuiviStockResponse | null>>(new Map());

  const key = (batiment: string, sex: string) => `${batiment}|${sex}`;

  useEffect(() => {
    if (!farmId || !lot || !semaine || allBatiments.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const setupPromises: Promise<void>[] = [];
    const hebdoPromises: Promise<void>[] = [];
    const productionPromises: Promise<void>[] = [];
    const stockPromises: Promise<void>[] = [];

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
        productionPromises.push(
          api.suiviProductionHebdo
            .get({ farmId, lot, semaine, sex, batiment })
            .then((r) => setProductionByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setProductionByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
        stockPromises.push(
          api.suiviStock
            .get({ farmId, lot, semaine, sex, batiment })
            .then((r) => setStockByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setStockByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
      }
    }

    Promise.all([...setupPromises, ...hebdoPromises, ...productionPromises, ...stockPromises]).finally(() =>
      setLoading(false)
    );
  }, [farmId, lot, semaine, allBatiments]);

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

  // Effectif départ de la semaine (e.g. S1) = sum of Effectif départ for all Mâle + all Femelle of every bâtiment.
  // So: total = Σ (over all batiments, over Mâle and Femelle) of effectif_depart for first day of that week.
  const totalEffectifDepart = useMemo(() => {
    let sum = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const list = hebdoLists.get(key(batiment, sex)) ?? [];
        const withEffectif = list.filter((r) => r.effectifDepart != null && r.recordDate);
        const byDate = [...withEffectif].sort(
          (a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? "")
        );
        const firstOfWeek = byDate[0];
        if (firstOfWeek?.effectifDepart != null) sum += firstOfWeek.effectifDepart;
      }
    }
    return sum;
  }, [hebdoLists, allBatiments]);

  const aggregatedRows = useMemo((): AggregatedRow[] => {
    const byDate = new Map<
      string,
      { mortaliteNbre: number; consoEauL: number; ageJour: number | null }
    >();

    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const list = hebdoLists.get(key(batiment, sex)) ?? [];
        for (const r of list) {
          if (!r.recordDate) continue;
          const existing = byDate.get(r.recordDate) ?? {
            mortaliteNbre: 0,
            consoEauL: 0,
            ageJour: null as number | null,
          };
          existing.mortaliteNbre += r.mortaliteNbre ?? 0;
          existing.consoEauL += r.consoEauL ?? 0;
          if (r.ageJour != null) existing.ageJour = existing.ageJour != null ? Math.min(existing.ageJour, r.ageJour) : r.ageJour;
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
      };
    });
  }, [hebdoLists, allBatiments, totalEffectifDepart]);

  const weeklyTotals = useMemo(() => {
    const totalMortality = aggregatedRows.reduce((s, r) => s + r.mortaliteNbre, 0);
    const totalWater = aggregatedRows.reduce((s, r) => s + r.consoEauL, 0);
    return { totalMortality, totalWater };
  }, [aggregatedRows]);

  const aggregatedProduction = useMemo(() => {
    let reportNbre = 0;
    let reportPoids = 0;
    let venteNbre = 0;
    let ventePoids = 0;
    let consoNbre = 0;
    let consoPoids = 0;
    let autreNbre = 0;
    let autrePoids = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const p = productionByKey.get(key(batiment, sex));
        if (p?.reportNbre != null) reportNbre += Number(p.reportNbre);
        if (p?.reportPoids != null) reportPoids += Number(p.reportPoids);
        if (p?.venteNbre != null) venteNbre += Number(p.venteNbre);
        if (p?.ventePoids != null) ventePoids += Number(p.ventePoids);
        if (p?.consoNbre != null) consoNbre += Number(p.consoNbre);
        if (p?.consoPoids != null) consoPoids += Number(p.consoPoids);
        if (p?.autreNbre != null) autreNbre += Number(p.autreNbre);
        if (p?.autrePoids != null) autrePoids += Number(p.autrePoids);
      }
    }
    const totalNbre = reportNbre + venteNbre + consoNbre + autreNbre;
    const totalPoids = reportPoids + ventePoids + consoPoids + autrePoids;
    return {
      reportNbre,
      reportPoids,
      venteNbre,
      ventePoids,
      consoNbre,
      consoPoids,
      autreNbre,
      autrePoids,
      totalNbre,
      totalPoids,
    };
  }, [productionByKey, allBatiments]);

  // EFFECTIF RESTANT FIN DE SEMAINE: computed from aggregated data so it matches Effectif départ and
  // avoids double-counting when the backend chains effectif across bâtiments (B2 départ = B1 restant).
  // Formula: effectif_départ (total) - mortalité (total) - sorties (vente + conso + autre).
  const effectifRestantFinSemaineComputed = useMemo(() => {
    const depart = totalEffectifDepart ?? 0;
    const mortalite = weeklyTotals.totalMortality ?? 0;
    const sorties =
      (aggregatedProduction.venteNbre ?? 0) +
      (aggregatedProduction.consoNbre ?? 0) +
      (aggregatedProduction.autreNbre ?? 0);
    return Math.max(0, depart - mortalite - sorties);
  }, [totalEffectifDepart, weeklyTotals.totalMortality, aggregatedProduction.venteNbre, aggregatedProduction.consoNbre, aggregatedProduction.autreNbre]);

  // Last active setup = last (batiment, sex) in chain order (B1 Mâle, B1 Femelle, B2 Mâle, …) that has a saved setup (SuiviSetupForm).
  // STOCK ALIMENT on resume = stock aliment for that (batiment, sex), i.e. final value after the last active setup in the chain.
  const lastActiveSetup = useMemo((): { batiment: string; sex: string } | null => {
    let last: { batiment: string; sex: string } | null = null;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const setup = setups.get(key(batiment, sex));
        if (setup != null) last = { batiment, sex };
      }
    }
    return last;
  }, [setups, allBatiments]);

  // Stock for the chosen semaine: effectif restant computed; poids vif summed; stock aliment = value for last active setup.
  const aggregatedStock = useMemo(() => {
    let poidsVifProduitKg = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const s = stockByKey.get(key(batiment, sex));
        if (s?.poidsVifProduitKg != null) poidsVifProduitKg += Number(s.poidsVifProduitKg);
      }
    }
    const stockAlimentFinal =
      lastActiveSetup != null
        ? (stockByKey.get(key(lastActiveSetup.batiment, lastActiveSetup.sex))?.stockAliment ?? null)
        : null;
    return {
      effectifRestantFinSemaine: effectifRestantFinSemaineComputed,
      poidsVifProduitKg,
      stockAliment: stockAlimentFinal,
    };
  }, [stockByKey, allBatiments, effectifRestantFinSemaineComputed, lastActiveSetup]);

  function formatStockValue(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return "—";
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Chargement des données…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* 2. Effectif départ de la semaine — somme de tous les bâtiments et des deux sexes (Mâle + Femelle) */}
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
            </colgroup>
            <thead>
              <tr className="bg-muted/80 border-b-2 border-border">
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">DATE</th>
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">ÂGE EN J</th>
                <th colSpan={4} className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">
                  MORTALITÉ
                </th>
                <th className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">
                  CONSO. EAU (L)
                </th>
              </tr>
              <tr className="bg-muted/60 border-b border-border">
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">NBRE</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">%</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">CUMUL</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">%</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
              </tr>
            </thead>
            <tbody>
              {aggregatedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
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
                    <td className="border-r border-border px-1 py-1 text-center tabular-nums">
                      {row.consoEauL.toFixed(1).replace(".", ",")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border">
                  TOTAL {semaine}
                </td>
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
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. Combined production tracking table (read-only) — sum of all batiments and both sexes */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            Suivi de production — Tous bâtiments — {semaine}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm border-collapse">
            <thead>
              <tr className="bg-muted/80 border-b-2 border-border">
                <th className="px-4 py-2.5 text-left font-semibold text-foreground border-r border-border w-[220px]">
                  INDICATEUR
                </th>
                <th className="px-4 py-2.5 text-center font-semibold text-foreground border-r border-border min-w-[100px]">
                  NB
                </th>
                <th className="px-4 py-2.5 text-center font-semibold text-foreground min-w-[100px]">
                  POIDS
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-amber-50 dark:bg-amber-950/20">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">REPORT</td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40">
                  {aggregatedProduction.reportNbre}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40">
                  {Number.isFinite(aggregatedProduction.reportPoids)
                    ? aggregatedProduction.reportPoids.toFixed(2).replace(".", ",")
                    : "0"}
                </td>
              </tr>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">VENTE</td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40">
                  {aggregatedProduction.venteNbre}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40">
                  {Number.isFinite(aggregatedProduction.ventePoids)
                    ? aggregatedProduction.ventePoids.toFixed(2).replace(".", ",")
                    : "0"}
                </td>
              </tr>
              <tr className="border-b border-border bg-muted/20">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">
                  CONSOMMATION employeur
                </td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40">
                  {aggregatedProduction.consoNbre}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40">
                  {Number.isFinite(aggregatedProduction.consoPoids)
                    ? aggregatedProduction.consoPoids.toFixed(2).replace(".", ",")
                    : "0"}
                </td>
              </tr>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">AUTRE gratuit</td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40">
                  {aggregatedProduction.autreNbre}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40">
                  {Number.isFinite(aggregatedProduction.autrePoids)
                    ? aggregatedProduction.autrePoids.toFixed(2).replace(".", ",")
                    : "0"}
                </td>
              </tr>
              <tr className="border-b border-border font-semibold bg-muted/50">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">TOTAL</td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40">
                  {aggregatedProduction.totalNbre}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40">
                  {Number.isFinite(aggregatedProduction.totalPoids)
                    ? aggregatedProduction.totalPoids.toFixed(2).replace(".", ",")
                    : "0"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Combined stock tracking table (read-only) — sum of all batiments and both sexes */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            STOCK — Tous bâtiments — {semaine}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm border-collapse">
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
                  EFFECTIF RESTANT FIN DE SEMAINE
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(aggregatedStock.effectifRestantFinSemaine)}
                </td>
              </tr>
              <tr className="border-b border-border bg-muted/10">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  POIDS VIF PRODUIT EN KG
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(aggregatedStock.poidsVifProduitKg)}
                </td>
              </tr>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  STOCK ALIMENT
                  <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                    {lastActiveSetup
                      ? `(valeur finale — dernier setup actif : ${lastActiveSetup.batiment}, ${lastActiveSetup.sex})`
                      : "(valeur finale — aucun setup enregistré)"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(aggregatedStock.stockAliment)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
