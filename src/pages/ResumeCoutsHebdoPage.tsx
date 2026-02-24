/**
 * Page "Résumé des coûts hebdomadaires" — shows only the PRIX DE REVIENT table.
 * URL: /suivi-technique-hebdomadaire/resume-couts?farmId=8&lot=1&semaine=S1&batiments=B1,B2,B3,B4
 * Rows ALIMENT, PDTS VETERINAIRES, PDTS D'HYGIENE, GAZ, PAILLE, ELECTRICITE, M.O (JOUR DE TRAVAIL): S1 = total Montant for the chosen week from each module.
 */

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import ResumeCoutsHebdoTable from "@/components/suivi-technique/ResumeCoutsHebdoTable";
import { api, type SuiviStockResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const SEXES = ["Mâle", "Femelle"] as const;
const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

/** Sort semaines: S1, S2, ... S24, then custom. */
function sortSemaines(sems: string[]): string[] {
  const uniq = [...new Set(sems.filter(Boolean).map((s) => s.trim()))];
  return uniq.sort((a, b) => {
    const numA = parseInt(a.replace(/^S(\d+)$/i, "$1"), 10);
    const numB = parseInt(b.replace(/^S(\d+)$/i, "$1"), 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    if (!Number.isNaN(numA)) return -1;
    if (!Number.isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
}

/** Sum montant for rows where sem/age matches semaine; cumul = sum for semaines up to and including selected. */
function sumMontantBySemaine<T extends { montant?: number | null }>(
  rows: T[],
  getSem: (r: T) => string | null | undefined,
  selectedSemaine: string
): { s1: number; cumul: number } {
  const rawSems = rows.map((r) => (getSem(r) ?? "").toString().trim()).filter(Boolean);
  const sel = selectedSemaine.trim();
  const uniq = [...new Set([...rawSems, sel].filter(Boolean))];
  const ordered = sortSemaines(uniq);
  const idx = ordered.findIndex((s) => s.toUpperCase() === sel.toUpperCase());
  const upTo = idx < 0 ? [] : ordered.slice(0, idx + 1);
  const setUpTo = new Set(upTo.map((s) => s.toUpperCase()));
  let s1 = 0;
  let cumul = 0;
  for (const r of rows) {
    const m = r.montant != null && Number.isFinite(Number(r.montant)) ? Number(r.montant) : 0;
    const sem = (getSem(r) ?? "").toString().trim();
    if (!sem) continue;
    const semU = sem.toUpperCase();
    if (semU === sel.toUpperCase()) s1 += m;
    if (setUpTo.has(semU)) cumul += m;
  }
  return { s1, cumul };
}

export interface ComputedCostRow {
  designation: string;
  valeurS1: number;
  cumul: number;
}

export default function ResumeCoutsHebdoPage() {
  const [searchParams] = useSearchParams();
  const { canUpdate } = useAuth();
  const canEditS1 = Boolean(canUpdate);
  const farmIdParam = searchParams.get("farmId");
  const lot = searchParams.get("lot") ?? "";
  const semaine = searchParams.get("semaine") ?? "";
  const batimentsParam = searchParams.get("batiments");

  const farmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const allBatiments =
    batimentsParam?.trim()
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean) ?? DEFAULT_BATIMENTS;

  const [loading, setLoading] = useState(true);
  const [stockByKey, setStockByKey] = useState<Map<string, SuiviStockResponse | null>>(new Map());
  const [costLines, setCostLines] = useState<Awaited<ReturnType<typeof api.suiviCoutHebdo.list>>>([]);
  const [computedCostRows, setComputedCostRows] = useState<ComputedCostRow[]>([]);

  const key = (batiment: string, sex: string) => `${batiment}|${sex}`;

  const poidsVifProduitKg = useMemo(() => {
    let sum = 0;
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        const s = stockByKey.get(key(batiment, sex));
        if (s?.poidsVifProduitKg != null) sum += Number(s.poidsVifProduitKg);
      }
    }
    return sum;
  }, [stockByKey, allBatiments]);

  // Depend on batimentsParam string to avoid new array reference every render (which would cause infinite loop)
  const batimentsKey = batimentsParam?.trim() ?? "";

  useEffect(() => {
    if (!farmId || !lot || !semaine || allBatiments.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const stockPromises: Promise<void>[] = [];
    for (const batiment of allBatiments) {
      for (const sex of SEXES) {
        stockPromises.push(
          api.suiviStock
            .get({ farmId, lot, semaine, sex, batiment })
            .then((r) => setStockByKey((prev) => new Map(prev).set(key(batiment, sex), r ?? null)))
            .catch(() => setStockByKey((prev) => new Map(prev).set(key(batiment, sex), null)))
        );
      }
    }
    const costPromise = api.suiviCoutHebdo
      .list({ farmId, lot, semaine })
      .then((list) => setCostLines(list ?? []))
      .catch(() => setCostLines([]));

    const modulePromise = (async () => {
      try {
        const [aliment, vet, hygiene, gaz, paille, elec, mainOeuvre] = await Promise.all([
          api.livraisonsAliment.list({ farmId, lot }),
          api.livraisonsProduitsVeterinaires.list({ farmId, lot }),
          api.livraisonsProduitsHygiene.list({ farmId, lot }),
          api.livraisonsGaz.list({ farmId, lot }),
          api.livraisonsPaille.list({ farmId, lot }),
          api.livraisonsElectricite.list({ farmId, lot }),
          api.mainOeuvre.list({ farmId, lot }),
        ]);
        const a = sumMontantBySemaine(aliment ?? [], (r) => r.sem, semaine);
        const v = sumMontantBySemaine(vet ?? [], (r) => r.age, semaine);
        const h = sumMontantBySemaine(hygiene ?? [], (r) => r.age, semaine);
        const g = sumMontantBySemaine(gaz ?? [], (r) => r.age, semaine);
        const p = sumMontantBySemaine(paille ?? [], (r) => r.age, semaine);
        const e = sumMontantBySemaine(elec ?? [], (r) => r.age, semaine);
        const mo = sumMontantBySemaine(mainOeuvre ?? [], (r) => r.age, semaine);
        setComputedCostRows([
          { designation: "ALIMENT", valeurS1: a.s1, cumul: a.cumul },
          { designation: "PDTS VETERINAIRES", valeurS1: v.s1, cumul: v.cumul },
          { designation: "PDTS D'HYGIENE", valeurS1: h.s1, cumul: h.cumul },
          { designation: "GAZ", valeurS1: g.s1, cumul: g.cumul },
          { designation: "PAILLE", valeurS1: p.s1, cumul: p.cumul },
          { designation: "ELECTRICITE", valeurS1: e.s1, cumul: e.cumul },
          { designation: "M.O (JOUR DE TRAVAIL)", valeurS1: mo.s1, cumul: mo.cumul },
        ]);
      } catch {
        setComputedCostRows([]);
      }
    })();

    Promise.all([...stockPromises, costPromise, modulePromise]).finally(() => setLoading(false));
  }, [farmId, lot, semaine, batimentsKey]);

  const backUrl =
    farmId != null && lot && semaine
      ? `/suivi-technique-hebdomadaire?farmId=${farmId}&lot=${encodeURIComponent(lot)}&semaine=${encodeURIComponent(semaine)}`
      : "/suivi-technique-hebdomadaire";

  const isValid = farmId != null && !Number.isNaN(farmId) && lot.trim() !== "" && semaine.trim() !== "";

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-col gap-3">
          <Link
            to={backUrl}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au suivi technique hebdomadaire
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Résumé des coûts hebdomadaires
          </h1>
          <p className="text-sm text-muted-foreground">
            Lot {lot} — Semaine {semaine}
            {allBatiments.length > 0 && ` — Bâtiments : ${allBatiments.join(", ")}`}
          </p>
        </div>
      </div>

      {!isValid ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          <p>Paramètres manquants ou invalides (farmId, lot, semaine).</p>
          <Link
            to="/suivi-technique-hebdomadaire"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Retour au suivi technique hebdomadaire
          </Link>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Chargement…</span>
        </div>
      ) : (
        <ResumeCoutsHebdoTable
          semaine={semaine}
          rows={costLines}
          computedRows={computedCostRows}
          poidsVifProduitKg={poidsVifProduitKg ?? null}
          canEditS1={canEditS1}
          farmId={farmId}
          lot={lot}
          onSaveSuccess={() =>
            api.suiviCoutHebdo.list({ farmId, lot, semaine }).then((list) => setCostLines(list ?? []))
          }
        />
      )}
    </AppLayout>
  );
}
