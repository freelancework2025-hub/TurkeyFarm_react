import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import WeeklyProductionSummaryContent from "@/components/suivi-technique/WeeklyProductionSummaryContent";

const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

/**
 * Full-page "Résumé hebdomadaire de la production" for a given lot and semaine.
 * URL: /suivi-technique-hebdomadaire/resume-production?farmId=8&lot=1&semaine=S1&batiments=B1,B2,B3,B4
 * batiments is optional; defaults to B1,B2,B3,B4.
 */
export default function ResumeProductionHebdoPage() {
  const [searchParams] = useSearchParams();
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

  const backUrl = farmId != null && lot && semaine
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
            Résumé hebdomadaire de la production
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
          <Link to="/suivi-technique-hebdomadaire" className="mt-3 inline-block text-sm text-primary hover:underline">
            Retour au suivi technique hebdomadaire
          </Link>
        </div>
      ) : (
        <WeeklyProductionSummaryContent
          farmId={farmId}
          lot={lot}
          semaine={semaine}
          allBatiments={allBatiments}
        />
      )}
    </AppLayout>
  );
}
