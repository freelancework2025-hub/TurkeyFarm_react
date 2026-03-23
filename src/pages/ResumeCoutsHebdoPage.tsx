/**
 * Page "Résumé des coûts hebdomadaires" — PRIX DE REVIENT table + PRIX DE REVIENT/SUJET, /KG.
 * All calculations done on backend via getResumeSummary — avoids client-side delay and refresh issues.
 * URL: /suivi-technique-hebdomadaire/resume-couts?farmId=8&lot=1&semaine=S1&batiments=B1,B2,B3,B4
 */

import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Download, FileSpreadsheet, FileText } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import ResumeCoutsHebdoTable from "@/components/suivi-technique/ResumeCoutsHebdoTable";
import { api, type FarmResponse, getStoredSelectedFarm } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { exportToExcel, exportToPdf } from "@/lib/resumeCoutsHebdoExport";
import { toOptionalNumber } from "@/lib/formatResumeAmount";

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
  const [farms, setFarms] = useState<FarmResponse[]>([]);

  const batimentsKey = batimentsParam?.trim() ?? "";

  useEffect(() => {
    api.farms.list().then((data) => setFarms(data ?? [])).catch(() => setFarms([]));
  }, []);

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
  const farmName =
    farmId != null && farms.length > 0
      ? (farms.find((f) => f.id === farmId)?.name ?? getStoredSelectedFarm()?.name ?? "Ferme")
      : (getStoredSelectedFarm()?.name ?? "Ferme");

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Link
              to={backUrl}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour au suivi technique hebdomadaire
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Résumé des coûts hebdomadaires
              </h1>
              {summary && isValid && (
                <TooltipProvider>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <ShimmerButton
                            type="button"
                            className="h-9 w-9 shrink-0 p-0 [border-radius:9999px] border-primary/40 text-primary"
                            background="#f1f5f9"
                            shimmerColor="rgba(37,99,235,0.3)"
                            shimmerDuration="2.5s"
                            aria-label="Télécharger Excel ou PDF"
                          >
                            <Download className="h-4 w-4 text-primary" />
                          </ShimmerButton>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="font-medium">
                        Télécharger (Excel ou PDF)
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="min-w-[180px]">
                      <DropdownMenuItem
                        onClick={() =>
                          exportToExcel({
                            farmName,
                            farmId: farmId!,
                            lot,
                            semaine,
                            batiments: allBatiments,
                            summary,
                          })
                        }
                        className="cursor-pointer gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        Télécharger Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          exportToPdf({
                            farmName,
                            farmId: farmId!,
                            lot,
                            semaine,
                            batiments: allBatiments,
                            summary,
                          })
                        }
                        className="cursor-pointer gap-2"
                      >
                        <FileText className="h-4 w-4 text-red-600" />
                        Télécharger PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipProvider>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Lot {lot} — Semaine {semaine}
              {allBatiments.length > 0 && ` — Bâtiments : ${allBatiments.join(", ")}`}
            </p>
          </div>
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
          rows={summary.costLines ?? []}
          computedRows={
            summary.computedRows?.map((r) => ({
              designation: r.designation,
              valeurS1: toOptionalNumber(r.valeurS1),
              cumul: toOptionalNumber(r.cumul),
            })) ?? []
          }
          poidsVifProduitKg={summary.poidsVifProduitKg != null ? Number(summary.poidsVifProduitKg) : null}
          effectifRestantFinSemaine={summary.effectifRestantFinSemaine ?? null}
          totalNbreProduction={summary.totalNbreProduction ?? null}
          prixRevientParSujet={summary.prixRevientParSujet != null ? Number(summary.prixRevientParSujet) : null}
          prixRevientParKg={summary.prixRevientParKg != null ? Number(summary.prixRevientParKg) : null}
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
