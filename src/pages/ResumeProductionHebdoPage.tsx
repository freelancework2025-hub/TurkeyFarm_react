import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Download, FileSpreadsheet, FileText } from "lucide-react";
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
import WeeklyProductionSummaryContent from "@/components/suivi-technique/WeeklyProductionSummaryContent";
import { api, type FarmResponse, getStoredSelectedFarm } from "@/lib/api";
import { exportToExcel, exportToPdf } from "@/lib/resumeProductionHebdoExport";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_BATIMENTS = ["B1", "B2", "B3", "B4"];

/**
 * Full-page "Résumé hebdomadaire de la production" for a given lot and semaine.
 * URL: /suivi-technique-hebdomadaire/resume-production?farmId=8&lot=1&semaine=S1&batiments=B1,B2,B3,B4
 * batiments is optional; defaults to B1,B2,B3,B4.
 * effectifRestantFinSemaine and totalNbreProduction come from getResumeSummary (same source as Prix de revient).
 * Permissions: child components (WeeklyProductionSummaryContent, etc.) apply the same role matrix; RESPONSABLE_FERME: saved rows read-only.
 */
export default function ResumeProductionHebdoPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const farmIdParam = searchParams.get("farmId");
  const lot = searchParams.get("lot") ?? "";
  const semaine = searchParams.get("semaine") ?? "";
  const batimentsParam = searchParams.get("batiments");

  const farmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  
  // Memoize allBatiments to prevent unnecessary re-renders
  const allBatiments = useMemo(
    () =>
      batimentsParam?.trim()
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean) ?? DEFAULT_BATIMENTS,
    [batimentsParam]
  );

  const [coutSummary, setCoutSummary] = useState<Awaited<ReturnType<typeof api.suiviCoutHebdo.getResumeSummary>> | null>(null);
  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Use ref instead of state to avoid extra renders
  const exportParamsRef = useRef<any>(null);

  const handleExportParamsReady = useCallback((params: any) => {
    exportParamsRef.current = params;
  }, []);

  // Fetch farms and coutSummary in parallel
  useEffect(() => {
    if (!farmId || !lot || !semaine || allBatiments.length === 0) {
      setCoutSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    Promise.all([
      api.farms.list().catch(() => []),
      api.suiviCoutHebdo.getResumeSummary({
        farmId,
        lot,
        semaine,
        batiments: allBatiments.join(","),
      }).catch(() => null),
    ]).then(([farmsData, summaryData]) => {
      setFarms(farmsData ?? []);
      setCoutSummary(summaryData ?? null);
      setLoading(false);
    });
  }, [farmId, lot, semaine, allBatiments]);

  const effectifRestantFinSemaine = coutSummary?.effectifRestantFinSemaine ?? null;
  const totalNbreProduction = coutSummary?.totalNbreProduction ?? null;

  const backUrl = farmId != null && lot && semaine
    ? `/suivi-technique-hebdomadaire?farmId=${farmId}&lot=${encodeURIComponent(lot)}&semaine=${encodeURIComponent(semaine)}`
    : "/suivi-technique-hebdomadaire";

  const isValid = farmId != null && !Number.isNaN(farmId) && lot.trim() !== "" && semaine.trim() !== "";
  const farmName =
    farmId != null && farms.length > 0
      ? (farms.find((f) => f.id === farmId)?.name ?? getStoredSelectedFarm()?.name ?? "Ferme")
      : (getStoredSelectedFarm()?.name ?? "Ferme");

  const handleExportExcel = async () => {
    if (!exportParamsRef.current) {
      toast({ title: "Erreur", description: "Données d'export non disponibles.", variant: "destructive" });
      return;
    }
    try {
      await exportToExcel(exportParamsRef.current);
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    if (!exportParamsRef.current) {
      toast({ title: "Erreur", description: "Données d'export non disponibles.", variant: "destructive" });
      return;
    }
    try {
      exportToPdf(exportParamsRef.current);
      toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier PDF.", variant: "destructive" });
    }
  };

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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Résumé hebdomadaire de la production
            </h1>
            {isValid && !loading && (
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
                    <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      Télécharger Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPdf} className="cursor-pointer gap-2">
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
          farmName={farmName}
          effectifRestantFinSemaine={effectifRestantFinSemaine}
          totalNbreProduction={totalNbreProduction}
          onExportParamsReady={handleExportParamsReady}
        />
      )}
    </AppLayout>
  );
}
