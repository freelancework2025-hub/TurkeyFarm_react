/**
 * Page "Résumé des coûts hebdomadaires" — PRIX DE REVIENT table + PRIX DE REVIENT/SUJET, /KG.
 * All calculations done on backend via getResumeSummary — avoids client-side delay and refresh issues.
 * URL: /suivi-technique-hebdomadaire/resume-couts?farmId=8&lot=1&semaine=S1&batiments=B1,B2,B3,B4
 */

import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import ResumeCoutsHebdoTable from "@/components/suivi-technique/ResumeCoutsHebdoTable";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

export default function ResumeCoutsHebdoPage() {
  const [searchParams] = useSearchParams();
  const { canCreate, canUpdate } = useAuth();
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
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.suiviCoutHebdo.getResumeSummary>> | null>(null);

  const batimentsKey = batimentsParam?.trim() ?? "";

  useEffect(() => {
    if (!farmId || !lot || !semaine || allBatiments.length === 0) {
      setLoading(false);
      setSummary(null);
      return;
    }
    setLoading(true);
    api.suiviCoutHebdo
      .getResumeSummary({
        farmId,
        lot,
        semaine,
        batiments: allBatiments.join(","),
      })
      .then((data) => setSummary(data ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
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
      ) : !summary ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          <p>Impossible de charger le résumé des coûts.</p>
        </div>
      ) : (
        <ResumeCoutsHebdoTable
          semaine={semaine}
          rows={summary?.costLines ?? []}
          computedRows={
            summary?.computedRows?.map((r) => ({
              designation: r.designation,
              valeurS1: Number(r.valeurS1) || 0,
              cumul: Number(r.cumul) || 0,
            })) ?? []
          }
          poidsVifProduitKg={summary?.poidsVifProduitKg != null ? Number(summary.poidsVifProduitKg) : null}
          effectifRestantFinSemaine={summary?.effectifRestantFinSemaine ?? null}
          totalNbreProduction={summary?.totalNbreProduction ?? null}
          prixRevientParSujet={summary?.prixRevientParSujet != null ? Number(summary.prixRevientParSujet) : null}
          prixRevientParKg={summary?.prixRevientParKg != null ? Number(summary.prixRevientParKg) : null}
          canCreate={canCreate}
          canUpdate={canUpdate}
          farmId={farmId}
          lot={lot}
          onSaveSuccess={() =>
            api.suiviCoutHebdo
              .getResumeSummary({ farmId, lot, semaine, batiments: allBatiments.join(",") })
              .then((data) => setSummary(data ?? null))
          }
        />
      )}
    </AppLayout>
  );
}
