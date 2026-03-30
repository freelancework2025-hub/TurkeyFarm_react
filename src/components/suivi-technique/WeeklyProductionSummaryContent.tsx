import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  api,
  type SuiviTechniqueSetupResponse,
  type SuiviTechniqueHebdoResponse,
  type SuiviProductionHebdoResponse,
  type SuiviStockResponse,
  type SuiviConsommationHebdoResponse,
  type ConsoResumeSummary,
  type DailyReportResponse,
} from "@/lib/api";
import ResumePerformanceTrackingTable from "@/components/suivi-technique/ResumePerformanceTrackingTable";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";
import { mergeHebdoRowsWithDailyReports } from "@/lib/mergeDailyReportsIntoWeeklyHebdo";
import { canonicalSemaine } from "@/lib/semaineCanonical";
import { fetchMortaliteCumulFinSemainePrecedente } from "@/lib/mortalitePrevWeekCumul";
import type { ResumeProductionHebdoExportParams } from "@/lib/resumeProductionHebdoExport";
import {
  RESUME_PRODUCTION_WEEKLY_UI_DATE,
  RESUME_PRODUCTION_WEEKLY_UI_AGE,
  RESUME_PRODUCTION_WEEKLY_UI_GROUP_MORTALITE,
  RESUME_PRODUCTION_WEEKLY_UI_CONSO_EAU,
  RESUME_PRODUCTION_WEEKLY_SUB_NBRE,
  RESUME_PRODUCTION_WEEKLY_SUB_PCT,
  RESUME_PRODUCTION_WEEKLY_SUB_CUMUL,
  RESUME_PRODUCTION_TRANSPORT_ROW_LABEL,
  RESUME_PRODUCTION_WEEKLY_COLUMN_COUNT,
  RESUME_PRODUCTION_TRANSPORT_LABEL_COLSPAN,
  RESUME_PRODUCTION_WEEKLY_TOTAL_LABEL_COLSPAN,
  getResumeProductionWeeklyTotalLabel,
  RESUME_PRODUCTION_LIVRAISON_TABLE_HEADERS,
  RESUME_PRODUCTION_LIVRAISON_HEADER_CLASS,
  RESUME_PRODUCTION_LIVRAISON_TOTAL_LABEL,
  RESUME_PRODUCTION_KV_TABLE_HEADERS,
  RESUME_PRODUCTION_KV_HEADER_CLASS,
  RESUME_PRODUCTION_CONTROLE_ECART_LABEL,
  formatResumeProductionHebdoPct,
} from "@/lib/resumeProductionHebdoShared";

const SEXES = ["Mâle", "Femelle"] as const;

function isSemaineS1(semaine: string): boolean {
  return /^S1$/i.test(semaine.trim());
}

/** Previous semaine for effectif chain: S2 → S1. Returns null for S1 or non-Sn format. */
function previousSemaineSn(semaine: string): string | null {
  const m = semaine.trim().match(/^S(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 1) return null;
  return `S${n - 1}`;
}

export interface WeeklyProductionSummaryContentProps {
  farmId: number;
  lot: string;
  semaine: string;
  allBatiments: string[];
  /** Farm name for export filename */
  farmName?: string;
  /** From getResumeSummary — same source as Prix de revient (preferred over local computation) */
  effectifRestantFinSemaine?: number | null;
  /** From getResumeSummary — report + vente + conso + autre (preferred over local computation) */
  totalNbreProduction?: number | null;
  /** Callback to pass export params to parent */
  onExportParamsReady?: (params: ResumeProductionHebdoExportParams) => void;
}

interface AggregatedRow {
  recordDate: string;
  ageJour: number | null;
  mortaliteNbre: number;
  mortalitePct: number;
  mortaliteCumul: number;
  mortaliteCumulPct: number;
  consoEauL: number;
}

export default function WeeklyProductionSummaryContent({
  farmId,
  lot,
  semaine,
  allBatiments,
  farmName = "Ferme",
  effectifRestantFinSemaine: effectifRestantFromBackend,
  totalNbreProduction: totalNbreFromBackend,
  onExportParamsReady,
}: WeeklyProductionSummaryContentProps) {
  const semaineCanon = useMemo(() => canonicalSemaine(semaine), [semaine]);
  const prevSemaine = useMemo(() => previousSemaineSn(semaineCanon), [semaineCanon]);
  const isFirstCycleWeek = prevSemaine == null;

  const [loading, setLoading] = useState(true);
  const [setups, setSetups] = useState<Map<string, SuiviTechniqueSetupResponse | null>>(new Map());
  const [hebdoLists, setHebdoLists] = useState<Map<string, SuiviTechniqueHebdoResponse[]>>(new Map());
  /** Stock fin de semaine précédente par bâtiment×sexe — même source que WeeklyTrackingTable pour l’effectif départ S2+. */
  const [stockPrevByKey, setStockPrevByKey] = useState<Map<string, SuiviStockResponse | null>>(new Map());
  /** Cumul mortalité fin semaine précédente par bâtiment×sexe — point de départ « MORTALITE DU TRANSPORT » en S2+. */
  const [prevWeekMortaliteCumulByKey, setPrevWeekMortaliteCumulByKey] = useState<Map<string, number>>(new Map());
  const [productionByKey, setProductionByKey] = useState<Map<string, SuiviProductionHebdoResponse | null>>(new Map());
  const [stockByKey, setStockByKey] = useState<Map<string, SuiviStockResponse | null>>(new Map());
  const [consumptionByKey, setConsumptionByKey] = useState<Map<string, SuiviConsommationHebdoResponse | null>>(new Map());
  const [resumeConsoSummary, setResumeConsoSummary] = useState<ConsoResumeSummary | null>(null);
  const [livraisonsAlimentList, setLivraisonsAlimentList] = useState<Awaited<ReturnType<typeof api.livraisonsAliment.list>>>([]);
  const [dailyReportsForLot, setDailyReportsForLot] = useState<DailyReportResponse[]>([]);

  const key = (batiment: string, sex: string) => `${batiment}|${sex}`;

  function parseIntLoose(s: string | undefined): number {
    if (s == null || !String(s).trim()) return 0;
    const n = parseInt(String(s).replace(/[\s\u00A0\u202F]/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
  }

  function parseAgeJour(s: string | undefined): number | null {
    if (s == null || !String(s).trim()) return null;
    const n = parseInt(String(s).replace(/[\s\u00A0\u202F]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }

  function parseFloatLoose(s: string | undefined): number | null {
    if (s == null || !String(s).trim()) return null;
    const n = parseFloat(String(s).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  useEffect(() => {
    if (!farmId || !lot || !semaineCanon || allBatiments.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    if (!prevSemaine) {
      setStockPrevByKey(new Map());
    }

    const setupPromises: Promise<void>[] = [];
    const hebdoPromises: Promise<void>[] = [];
    const productionPromises: Promise<void>[] = [];
    const stockPromises: Promise<void>[] = [];
    const consumptionPromises: Promise<void>[] = [];
    const stockPrevPromises: Promise<void>[] = [];

    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        setupPromises.push(
          api.suiviTechniqueSetup
            .getBySex({ farmId, lot, semaine: semaineCanon, sex, batiment })
            .then((r) => setSetups((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setSetups((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
        hebdoPromises.push(
          api.suiviTechniqueHebdo
            .list({ farmId, lot, sex, batiment, semaine: semaineCanon })
            .then((list) => setHebdoLists((prev) => new Map(prev).set(key(batiment, sex), list ?? [])))
            .catch(() => setHebdoLists((prev) => new Map(prev).set(key(batiment, sex), [])))
        );
        productionPromises.push(
          api.suiviProductionHebdo
            .get({ farmId, lot, semaine: semaineCanon, sex, batiment })
            .then((r) => setProductionByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setProductionByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
        stockPromises.push(
          api.suiviStock
            .get({ farmId, lot, semaine: semaineCanon, sex, batiment })
            .then((r) => setStockByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setStockByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
        consumptionPromises.push(
          api.suiviConsommationHebdo
            .get({ farmId, lot, semaine: semaineCanon, sex, batiment })
            .then((r) => setConsumptionByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setConsumptionByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
        if (prevSemaine) {
          stockPrevPromises.push(
            api.suiviStock
              .get({ farmId, lot, semaine: prevSemaine, sex, batiment })
              .then((r) => setStockPrevByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
              .catch(() => setStockPrevByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
          );
        }
      }
    }

    const livraisonsPromise = api.livraisonsAliment
      .list({ farmId, lot, sem: semaineCanon })
      .then((list) => setLivraisonsAlimentList(list ?? []))
      .catch(() => setLivraisonsAlimentList([]));

    const resumeSummaryPromise = api.suiviConsommationHebdo
      .getResumeSummary({ farmId, lot, semaine: semaineCanon, batiments: allBatiments })
      .then((r) => setResumeConsoSummary(r ?? null))
      .catch(() => setResumeConsoSummary(null));

    const dailyPromise = api.dailyReports
      .list(farmId, lot)
      .then((list) => setDailyReportsForLot(list ?? []))
      .catch(() => setDailyReportsForLot([]));

    const priorCumulPromise = Promise.all(
      allBatiments.flatMap((batiment) =>
        SEXES.map((sex) =>
          fetchMortaliteCumulFinSemainePrecedente(farmId, lot, sex, batiment, semaineCanon).then(
            (cumul) => [key(batiment, sex), cumul] as const
          )
        )
      )
    ).then((entries) => setPrevWeekMortaliteCumulByKey(new Map(entries)));

    Promise.all([
      ...setupPromises,
      ...hebdoPromises,
      ...productionPromises,
      ...stockPromises,
      ...consumptionPromises,
      ...stockPrevPromises,
      livraisonsPromise,
      resumeSummaryPromise,
      dailyPromise,
      priorCumulPromise,
    ]).finally(() => setLoading(false));
  }, [farmId, lot, semaineCanon, prevSemaine, allBatiments.join(",")]);

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

  // Effectif départ = Σ sur bâtiments×sexes actifs (effectif mis en place > 0), même résolution que WeeklyTrackingTable :
  // hebdo (1er jour avec effectif enregistré) → sinon S1 : effectif mis en place du setup → sinon S2+ : effectif restant fin semaine précédente (stock).
  const totalEffectifDepart = useMemo(() => {
    let sum = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const setup = setups.get(key(batiment, sex));
        if ((setup?.effectifMisEnPlace ?? 0) <= 0) continue;

        const list = hebdoLists.get(key(batiment, sex)) ?? [];
        const withEffectif = list.filter((r) => r.effectifDepart != null && r.recordDate);
        const byDate = [...withEffectif].sort(
          (a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? "")
        );
        let ed: number | null = byDate[0]?.effectifDepart ?? null;

        if (ed == null && isFirstCycleWeek) {
          const emp = setup?.effectifMisEnPlace;
          if (emp != null && emp > 0) ed = emp;
        }
        if (ed == null && prevSemaine != null) {
          const prevStock = stockPrevByKey.get(key(batiment, sex));
          const rest = prevStock?.effectifRestantFinSemaine;
          if (rest != null) ed = rest;
        }
        if (ed != null) sum += ed;
      }
    }
    return sum;
  }, [hebdoLists, allBatiments, setups, stockPrevByKey, isFirstCycleWeek, prevSemaine]);

  /**
   * Même logique que WeeklyTrackingTable par bâtiment×sexe, puis somme sur les périmètres actifs
   * (effectif mis en place > 0 pour la semaine), comme sur Suivi technique hebdomadaire.
   * S1 : somme des mortalités NBRE du premier jour (données fusionnées hebdo + journalier).
   * S2+ : somme des cumuls fin semaine précédente (API transport-cumul), identique à mortaliteTransportCumul affiché par bâtiment.
   */
  const totalMortaliteTransportAllBatiments = useMemo(() => {
    const isActiveBatimentSex = (batiment: string, sex: (typeof SEXES)[number]) => {
      const setup = setups.get(key(batiment, sex));
      return (setup?.effectifMisEnPlace ?? 0) > 0;
    };

    if (isSemaineS1(semaineCanon)) {
      let s1Sum = 0;
      for (const batiment of allBatiments) {
        for (const sex of SEXES) {
          if (!isActiveBatimentSex(batiment, sex)) continue;
          const raw = hebdoLists.get(key(batiment, sex)) ?? [];
          const merged = mergeHebdoRowsWithDailyReports(raw, dailyReportsForLot, {
            lot,
            batiment,
            sex,
            semaine: semaineCanon,
          });
          const withDate = merged.filter((r) => r.recordDate?.trim());
          if (withDate.length === 0) continue;
          const sorted = [...withDate].sort((a, b) =>
            (a.recordDate ?? "").localeCompare(b.recordDate ?? "")
          );
          s1Sum += parseIntLoose(sorted[0].mortaliteNbre);
        }
      }
      return s1Sum;
    }

    let sum = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        if (!isActiveBatimentSex(batiment, sex)) continue;
        sum += prevWeekMortaliteCumulByKey.get(key(batiment, sex)) ?? 0;
      }
    }
    return sum;
  }, [
    semaineCanon,
    allBatiments,
    prevWeekMortaliteCumulByKey,
    setups,
    hebdoLists,
    dailyReportsForLot,
    lot,
  ]);

  const mortaliteTransportRowPct = useMemo(() => {
    const em = aggregatedSetup.effectifMisEnPlace;
    if (em <= 0) return Number.NaN;
    return (totalMortaliteTransportAllBatiments / em) * 100;
  }, [totalMortaliteTransportAllBatiments, aggregatedSetup.effectifMisEnPlace]);

  const aggregatedRows = useMemo((): AggregatedRow[] => {
    const byDate = new Map<
      string,
      {
        mortaliteNbre: number;
        consoEauL: number;
        ageJour: number | null;
      }
    >();

    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const raw = hebdoLists.get(key(batiment, sex)) ?? [];
        const merged = mergeHebdoRowsWithDailyReports(raw, dailyReportsForLot, {
          lot,
          batiment,
          sex,
          semaine: semaineCanon,
        });
        for (const r of merged) {
          if (!r.recordDate) continue;
          const nbre = parseIntLoose(r.mortaliteNbre);
          const conso = parseFloatLoose(r.consoEauL) ?? 0;
          const age = parseAgeJour(r.ageJour);
          const existing = byDate.get(r.recordDate) ?? {
            mortaliteNbre: 0,
            consoEauL: 0,
            ageJour: null as number | null,
          };
          existing.mortaliteNbre += nbre;
          existing.consoEauL += conso;
          if (age != null) existing.ageJour = existing.ageJour != null ? Math.min(existing.ageJour, age) : age;
          byDate.set(r.recordDate, existing);
        }
      }
    }

    const sortedDates = Array.from(byDate.keys()).sort();
    /** % journée : même logique que le suivi hebdo — effectif départ de la semaine (somme bâtiments × sexes). */
    const effectifDepartSemaine = totalEffectifDepart;
    /** % cumul : cumul mortalité ÷ effectif mis en place total (somme des setups Mâle+Femelle × bâtiments pour la semaine). */
    const effectifMisEnPlaceSemaine = aggregatedSetup.effectifMisEnPlace;
    /** Cumul journalier inclut la somme des cumuls départ (fin semaine précédente) sur tous les bâtiments × sexes. */
    let runningCumul = totalMortaliteTransportAllBatiments;

    return sortedDates.map((recordDate) => {
      const row = byDate.get(recordDate)!;
      runningCumul += row.mortaliteNbre;
      const mortalitePct =
        effectifDepartSemaine > 0 ? (row.mortaliteNbre / effectifDepartSemaine) * 100 : Number.NaN;
      const mortaliteCumulPct =
        effectifMisEnPlaceSemaine > 0 ? (runningCumul / effectifMisEnPlaceSemaine) * 100 : Number.NaN;
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
  }, [
    hebdoLists,
    dailyReportsForLot,
    allBatiments,
    lot,
    semaineCanon,
    totalEffectifDepart,
    aggregatedSetup.effectifMisEnPlace,
    totalMortaliteTransportAllBatiments,
  ]);

  const weeklyTotals = useMemo(() => {
    const totalMortality = aggregatedRows.reduce((s, r) => s + r.mortaliteNbre, 0);
    const totalWater = aggregatedRows.reduce((s, r) => s + r.consoEauL, 0);
    return { totalMortality, totalWater };
  }, [aggregatedRows]);

  /** Cumul mortalité en fin de semaine affichée (transport départ + somme journalière) — pour ligne TOTAL et exports. */
  const totalMortaliteCumulFinSemaine = useMemo(() => {
    if (aggregatedRows.length > 0) {
      return aggregatedRows[aggregatedRows.length - 1].mortaliteCumul;
    }
    return totalMortaliteTransportAllBatiments;
  }, [aggregatedRows, totalMortaliteTransportAllBatiments]);

  const totalMortaliteCumulFinSemainePct = useMemo(() => {
    const em = aggregatedSetup.effectifMisEnPlace;
    if (em <= 0) return Number.NaN;
    return (totalMortaliteCumulFinSemaine / em) * 100;
  }, [totalMortaliteCumulFinSemaine, aggregatedSetup.effectifMisEnPlace]);

  /** Last value of cumul mortalité % (last day of week) for VIABILITE = 100% − this */
  const lastMortaliteCumulPct = useMemo((): number | null => {
    if (aggregatedRows.length === 0) return null;
    const last = aggregatedRows[aggregatedRows.length - 1];
    const pct = last.mortaliteCumulPct;
    return Number.isFinite(pct) ? pct : null;
  }, [aggregatedRows]);

  // CONSOMME ALIMENT (semaine) and CUMUL: prefer resume-summary API; cumul stays chain-correct from resume.
  // When resume returns 0 kg but per-bâtiment GETs have conso (S2+ edge: stock/effectif filters), sum conso from GETs so INDICE EAU/ALIMENT still shows.
  const aggregatedConsommation = useMemo(() => {
    let keyedConsoSum = 0;
    let keyedCumulSum = 0;
    let keyedConsoMale = 0;
    let keyedConsoFemelle = 0;
    let keyedCumulMale = 0;
    let keyedCumulFemelle = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const stock = stockByKey.get(key(batiment, sex));
        if (!stock?.stockAlimentRecordExists) continue;
        const c = consumptionByKey.get(key(batiment, sex));
        const consoVal = c?.consommationAlimentSemaine != null ? Number(c.consommationAlimentSemaine) : 0;
        const cumulVal = c?.cumulAlimentConsomme != null ? Number(c.cumulAlimentConsomme) : 0;
        keyedConsoSum += consoVal;
        keyedCumulSum += cumulVal;
        if (sex === "Mâle") {
          keyedConsoMale += consoVal;
          keyedCumulMale += cumulVal;
        } else {
          keyedConsoFemelle += consoVal;
          keyedCumulFemelle += cumulVal;
        }
      }
    }

    if (resumeConsoSummary != null) {
      const consoResume = resumeConsoSummary.consoAlimentSemaineSum != null ? Number(resumeConsoSummary.consoAlimentSemaineSum) : 0;
      const cumul = resumeConsoSummary.cumulAlimentConsommeSum != null ? Number(resumeConsoSummary.cumulAlimentConsommeSum) : 0;
      let consoMale = resumeConsoSummary.consoAlimentSemaineMale != null ? Number(resumeConsoSummary.consoAlimentSemaineMale) : null;
      let consoFemelle = resumeConsoSummary.consoAlimentSemaineFemelle != null ? Number(resumeConsoSummary.consoAlimentSemaineFemelle) : null;
      const cumulMale = resumeConsoSummary.cumulAlimentConsommeMale != null ? Number(resumeConsoSummary.cumulAlimentConsommeMale) : null;
      const cumulFemelle = resumeConsoSummary.cumulAlimentConsommeFemelle != null ? Number(resumeConsoSummary.cumulAlimentConsommeFemelle) : null;

      let conso = consoResume;
      if (conso <= 0 && keyedConsoSum > 0) {
        conso = keyedConsoSum;
        consoMale = keyedConsoMale;
        consoFemelle = keyedConsoFemelle;
      }
      return {
        consoAlimentSemaineSum: conso,
        cumulAlimentConsommeSum: cumul,
        consoAlimentSemaineMale: consoMale,
        consoAlimentSemaineFemelle: consoFemelle,
        cumulAlimentConsommeMale: cumulMale,
        cumulAlimentConsommeFemelle: cumulFemelle,
      };
    }
    return {
      consoAlimentSemaineSum: keyedConsoSum,
      cumulAlimentConsommeSum: keyedCumulSum,
      consoAlimentSemaineMale: keyedConsoMale,
      consoAlimentSemaineFemelle: keyedConsoFemelle,
      cumulAlimentConsommeMale: keyedCumulMale,
      cumulAlimentConsommeFemelle: keyedCumulFemelle,
    };
  }, [resumeConsoSummary, consumptionByKey, stockByKey, allBatiments]);

  // INDICE EAU/ALIMENT = TOTAL semaine CONSO. EAU (L) / CONSOMME ALIMENT semaine (kg)
  const indiceEauAlimentResume =
    aggregatedConsommation.consoAlimentSemaineSum != null &&
    aggregatedConsommation.consoAlimentSemaineSum > 0
      ? weeklyTotals.totalWater / aggregatedConsommation.consoAlimentSemaineSum
      : null;

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

  // Stock for the chosen semaine: effectif restant computed; poids vif summed; stock aliment = sum of stock
  // for each sex in each activated batiment (batiment+sex with a setup record).
  const aggregatedStock = useMemo(() => {
    let poidsVifProduitKg = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const s = stockByKey.get(key(batiment, sex));
        if (s?.poidsVifProduitKg != null) poidsVifProduitKg += Number(s.poidsVifProduitKg);
      }
    }
    // Sum of stock aliment over each sex in each activated batiment (only batiment+sex with setup)
    let stockAlimentSum = 0;
    let hasAnyStock = false;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const setup = setups.get(key(batiment, sex));
        if (!setup) continue;
        const s = stockByKey.get(key(batiment, sex));
        if (s?.stockAliment != null && !Number.isNaN(Number(s.stockAliment))) {
          stockAlimentSum += Number(s.stockAliment);
          hasAnyStock = true;
        }
      }
    }
    const stockAlimentFinal = hasAnyStock ? stockAlimentSum : null;
    const effectifRestant = effectifRestantFromBackend != null
      ? effectifRestantFromBackend
      : effectifRestantFinSemaineComputed;
    return {
      effectifRestantFinSemaine: effectifRestant,
      poidsVifProduitKg,
      stockAliment: stockAlimentFinal,
    };
  }, [stockByKey, setups, allBatiments, effectifRestantFinSemaineComputed, effectifRestantFromBackend]);

  /** Quantité livrée = sum of QTE for the selected semaine (from livraisons aliment) */
  const quantiteLivreeSemaine = useMemo(() => {
    return livraisonsAlimentList
      .filter((r) => canonicalSemaine(r.sem ?? "") === semaineCanon)
      .reduce((sum, r) => sum + (Number(r.qte) || 0), 0);
  }, [livraisonsAlimentList, semaineCanon]);

  /** QL-Stock = Quantité livrée − stock aliment */
  const qlStock = useMemo(() => {
    const stock = aggregatedStock.stockAliment;
    if (stock == null || Number.isNaN(stock)) return null;
    return quantiteLivreeSemaine - Number(stock);
  }, [quantiteLivreeSemaine, aggregatedStock.stockAliment]);

  /** ECART = QL-Stock − CUMUL ALIMENT CONSOMME (semaine) */
  const ecart = useMemo(() => {
    if (qlStock == null || !Number.isFinite(qlStock)) return null;
    const cumul = aggregatedConsommation.cumulAlimentConsommeSum;
    if (cumul == null || !Number.isFinite(cumul)) return null;
    return qlStock - Number(cumul);
  }, [qlStock, aggregatedConsommation.cumulAlimentConsommeSum]);

  /** Performance metrics for export (same logic as ResumePerformanceTrackingTable) */
  const exportPerformance = useMemo(() => {
    const totalNbre = totalNbreFromBackend ?? aggregatedProduction.totalNbre;
    const effectif = aggregatedStock.effectifRestantFinSemaine ?? 0;
    const denom = (totalNbre ?? 0) + effectif;
    const poidsMoyenG =
      denom > 0 && aggregatedStock.poidsVifProduitKg != null && Number.isFinite(aggregatedStock.poidsVifProduitKg)
        ? (aggregatedStock.poidsVifProduitKg / denom) * 1000
        : null;
    const indiceConsommation =
      aggregatedStock.poidsVifProduitKg != null &&
      aggregatedStock.poidsVifProduitKg > 0 &&
      aggregatedConsommation.cumulAlimentConsommeSum != null &&
      Number.isFinite(aggregatedConsommation.cumulAlimentConsommeSum)
        ? aggregatedConsommation.cumulAlimentConsommeSum / aggregatedStock.poidsVifProduitKg
        : null;
    const gmqGParJour = poidsMoyenG != null && Number.isFinite(poidsMoyenG) ? poidsMoyenG / 7 : null;
    const viabilite =
      lastMortaliteCumulPct != null && Number.isFinite(lastMortaliteCumulPct)
        ? 100 - lastMortaliteCumulPct
        : null;
    const consoAlimentKgParJ =
      aggregatedConsommation.consoAlimentSemaineSum != null && Number.isFinite(aggregatedConsommation.consoAlimentSemaineSum)
        ? aggregatedConsommation.consoAlimentSemaineSum / 7
        : null;
    return {
      consoAlimentSemaineSum: aggregatedConsommation.consoAlimentSemaineSum,
      cumulAlimentConsommeSum: aggregatedConsommation.cumulAlimentConsommeSum,
      indiceEauAliment: indiceEauAlimentResume,
      poidsMoyenG,
      indiceConsommation,
      gmqGParJour,
      viabilite,
      consoAlimentKgParJ,
    };
  }, [
    totalNbreFromBackend,
    aggregatedProduction.totalNbre,
    aggregatedStock.effectifRestantFinSemaine,
    aggregatedStock.poidsVifProduitKg,
    aggregatedConsommation,
    indiceEauAlimentResume,
    lastMortaliteCumulPct,
  ]);

  const exportParams = useMemo(
    () => ({
      farmName,
      lot,
      semaine,
      batiments: allBatiments,
      setup: aggregatedSetup,
      totalEffectifDepart,
      mortaliteTransportTousBatiments: totalMortaliteTransportAllBatiments,
      mortaliteTransportPct:
        aggregatedSetup.effectifMisEnPlace > 0
          ? (totalMortaliteTransportAllBatiments / aggregatedSetup.effectifMisEnPlace) * 100
          : null,
      weeklyRows: aggregatedRows,
      weeklyTotals,
      performance: exportPerformance,
      production: aggregatedProduction,
      stock: aggregatedStock,
      controleStock: { quantiteLivree: quantiteLivreeSemaine, qlStock, ecart },
    }),
    [
      farmName,
      lot,
      semaine,
      allBatiments,
      aggregatedSetup,
      totalEffectifDepart,
      totalMortaliteTransportAllBatiments,
      aggregatedRows,
      weeklyTotals,
      exportPerformance,
      aggregatedProduction,
      aggregatedStock,
      quantiteLivreeSemaine,
      qlStock,
      ecart,
    ]
  );

  // Pass export params to parent when ready (only once when data is loaded)
  useEffect(() => {
    if (onExportParamsReady && !loading) {
      onExportParamsReady(exportParams);
    }
  }, [loading, onExportParamsReady, exportParams]);

  function formatStockValue(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return "—";
    return Number.isInteger(value) ? formatGroupedNumber(value, 0) : formatGroupedNumber(value, 2);
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
      {/* 1. Données mises en place — combined */}
      <div className="bg-card rounded-lg border border-border shadow-sm p-5">
        <h3 className="text-base font-display font-bold text-foreground mb-3">
          Données mises en place — Configuration initiale pour le lot {lot}
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
              {formatGroupedNumber(aggregatedSetup.effectifMisEnPlace, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Effectif départ de la semaine — somme de tous les bâtiments et des deux sexes (Mâle + Femelle) */}
      <div className="inline-flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Effectif départ de {semaine}</label>
          <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-semibold text-foreground w-28">
            {formatGroupedNumber(totalEffectifDepart, 0)}
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
          <table className="w-full min-w-[720px] text-sm border-collapse bg-card table-fixed">
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
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_UI_DATE}
                </th>
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_UI_AGE}
                </th>
                <th
                  colSpan={4}
                  className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border"
                >
                  {RESUME_PRODUCTION_WEEKLY_UI_GROUP_MORTALITE}
                </th>
                <th className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_UI_CONSO_EAU}
                </th>
              </tr>
              <tr className="bg-muted/60 border-b border-border">
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_SUB_NBRE}
                </th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_SUB_PCT}
                </th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_SUB_CUMUL}
                </th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">
                  {RESUME_PRODUCTION_WEEKLY_SUB_PCT}
                </th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-muted/40">
                <td
                  colSpan={RESUME_PRODUCTION_TRANSPORT_LABEL_COLSPAN}
                  className="border-r border-border px-2 py-2 text-center font-semibold text-foreground align-middle"
                >
                  {RESUME_PRODUCTION_TRANSPORT_ROW_LABEL}
                </td>
                <td className="border-r border-border px-1 py-2 text-center tabular-nums align-middle bg-amber-100/80 dark:bg-amber-950/40">
                  {formatGroupedNumber(totalMortaliteTransportAllBatiments, 0)}
                </td>
                <td className="border-r border-border px-1 py-2 text-center tabular-nums text-muted-foreground align-middle">
                  {formatResumeProductionHebdoPct(mortaliteTransportRowPct)}
                </td>
                <td className="border-r border-border px-1 py-2 align-middle" />
              </tr>
              {aggregatedRows.length === 0 ? (
                <tr>
                  <td colSpan={RESUME_PRODUCTION_WEEKLY_COLUMN_COUNT} className="px-4 py-8 text-center text-muted-foreground">
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
                    <td className="border-r border-border px-1 py-1 text-center tabular-nums whitespace-nowrap">
                      {row.ageJour != null ? formatGroupedNumber(row.ageJour, 0) : "—"}
                    </td>
                    <td className="border-r border-border px-1 py-1 text-center tabular-nums whitespace-nowrap">
                      {formatGroupedNumber(row.mortaliteNbre, 0)}
                    </td>
                    <td className="border-r border-border px-1 py-1 text-center text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatResumeProductionHebdoPct(row.mortalitePct)}
                    </td>
                    <td className="border-r border-border px-1 py-1 text-center tabular-nums whitespace-nowrap">
                      {formatGroupedNumber(row.mortaliteCumul, 0)}
                    </td>
                    <td className="border-r border-border px-1 py-1 text-center text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatResumeProductionHebdoPct(row.mortaliteCumulPct)}
                    </td>
                    <td className="border-r border-border px-1 py-1 text-center tabular-nums whitespace-nowrap">
                      {formatGroupedNumber(row.consoEauL, 2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                <td
                  colSpan={RESUME_PRODUCTION_WEEKLY_TOTAL_LABEL_COLSPAN}
                  className="px-1.5 py-2 text-center border-r border-border"
                >
                  {getResumeProductionWeeklyTotalLabel(semaine)}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-destructive whitespace-nowrap">
                  {formatGroupedNumber(weeklyTotals.totalMortality, 0)}
                </td>
                <td className="px-1.5 py-2 text-center text-muted-foreground border-r border-border tabular-nums whitespace-nowrap">
                  {totalEffectifDepart > 0
                    ? formatResumeProductionHebdoPct((weeklyTotals.totalMortality / totalEffectifDepart) * 100)
                    : "—"}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums whitespace-nowrap">
                  {formatGroupedNumber(totalMortaliteCumulFinSemaine, 0)}
                </td>
                <td className="px-1.5 py-2 text-center text-muted-foreground border-r border-border tabular-nums whitespace-nowrap">
                  {formatResumeProductionHebdoPct(totalMortaliteCumulFinSemainePct)}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-muted-foreground whitespace-nowrap">
                  {`${formatGroupedNumber(weeklyTotals.totalWater, 2)} L`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. Performance / Consommation résumé — CONSOMME ALIMENT, CUMUL ALIMENT, INDICE EAU/ALIMENT */}
      <ResumePerformanceTrackingTable
        semaine={semaine}
        consoAlimentSemaineSum={aggregatedConsommation.consoAlimentSemaineSum}
        cumulAlimentConsommeSum={aggregatedConsommation.cumulAlimentConsommeSum}
        indiceEauAliment={indiceEauAlimentResume}
        poidsVifProduitKg={aggregatedStock.poidsVifProduitKg}
        totalNbreSuiviProduction={
          totalNbreFromBackend != null ? totalNbreFromBackend : aggregatedProduction.totalNbre
        }
        effectifRestantFinSemaine={aggregatedStock.effectifRestantFinSemaine}
        lastMortaliteCumulPct={lastMortaliteCumulPct}
      />

      {/* 5. Combined production tracking table (read-only) — sum of all batiments and both sexes */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            Suivi de la livraison — Tous bâtiments — {semaine}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm border-collapse">
            <thead>
              <tr className="bg-muted/80 border-b-2 border-border">
                {RESUME_PRODUCTION_LIVRAISON_TABLE_HEADERS.map((h) => (
                  <th key={h} className={RESUME_PRODUCTION_LIVRAISON_HEADER_CLASS[h]}>
                    {h}
                  </th>
                ))}
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
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {formatGroupedNumber(aggregatedProduction.venteNbre, 0)}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {Number.isFinite(aggregatedProduction.ventePoids)
                    ? formatGroupedNumber(aggregatedProduction.ventePoids, 2)
                    : formatGroupedNumber(0, 2)}
                </td>
              </tr>
              <tr className="border-b border-border bg-muted/20">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">
                  CONSOMMATION employeur
                </td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {formatGroupedNumber(aggregatedProduction.consoNbre, 0)}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {Number.isFinite(aggregatedProduction.consoPoids)
                    ? formatGroupedNumber(aggregatedProduction.consoPoids, 2)
                    : formatGroupedNumber(0, 2)}
                </td>
              </tr>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">AUTRE gratuit</td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {formatGroupedNumber(aggregatedProduction.autreNbre, 0)}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {Number.isFinite(aggregatedProduction.autrePoids)
                    ? formatGroupedNumber(aggregatedProduction.autrePoids, 2)
                    : formatGroupedNumber(0, 2)}
                </td>
              </tr>
              <tr className="border-b border-border font-semibold bg-muted/50">
                <td className="px-4 py-2 border-r border-border font-medium text-foreground">
                  {RESUME_PRODUCTION_LIVRAISON_TOTAL_LABEL}
                </td>
                <td className="px-4 py-2 border-r border-border text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {formatGroupedNumber(aggregatedProduction.totalNbre, 0)}
                </td>
                <td className="px-4 py-2 text-center tabular-nums bg-muted/40 whitespace-nowrap">
                  {Number.isFinite(aggregatedProduction.totalPoids)
                    ? formatGroupedNumber(aggregatedProduction.totalPoids, 2)
                    : formatGroupedNumber(0, 2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Combined stock tracking table (read-only) — sum of all batiments and both sexes */}
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
                {RESUME_PRODUCTION_KV_TABLE_HEADERS.map((h) => (
                  <th key={h} className={RESUME_PRODUCTION_KV_HEADER_CLASS[h]}>
                    {h}
                  </th>
                ))}
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
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(aggregatedStock.stockAliment)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Contrôle des stocks — Quantité livrée (cumul QTE semaine), QL-Stock */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            Contrôle des stocks — {semaine}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {RESUME_PRODUCTION_KV_TABLE_HEADERS.map((h) => (
                  <th key={h} className={RESUME_PRODUCTION_KV_HEADER_CLASS[h]}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  Quantité livrée
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(quantiteLivreeSemaine)}
                </td>
              </tr>
              <tr className="border-b border-border bg-muted/10">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  QL-Stock
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(qlStock)}
                </td>
              </tr>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  {RESUME_PRODUCTION_CONTROLE_ECART_LABEL}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {formatStockValue(ecart)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
