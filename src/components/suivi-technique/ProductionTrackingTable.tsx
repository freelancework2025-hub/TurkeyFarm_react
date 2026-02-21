import { useState, useEffect, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import { api, type SuiviProductionHebdoResponse, type SuiviProductionHebdoRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type RowKey = "report" | "vente" | "conso" | "autre" | "total";

interface ProductionRow {
  key: RowKey;
  label: string;
  readOnly: boolean;
  isTotal: boolean;
}

const ROWS: ProductionRow[] = [
  { key: "report", label: "REPORT", readOnly: true, isTotal: false },
  { key: "vente", label: "VENTE", readOnly: false, isTotal: false },
  { key: "conso", label: "CONSOMMATION employeur", readOnly: false, isTotal: false },
  { key: "autre", label: "AUTRE gratuit", readOnly: false, isTotal: false },
  { key: "total", label: "TOTAL", readOnly: true, isTotal: true },
];

interface ProductionTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Bâtiment (Lot → Semaine → Batiment workflow). Required when used from SuiviTechniqueHebdomadaire. */
  batiment?: string;
  /** Called after production is saved so parent can refresh stock. */
  onSaveSuccess?: () => void;
}

/** Normalize NB (integer) input: strip leading zeros so "041" → "41" */
function normalizeNbreInput(value: string): string {
  if (value === "") return "";
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return value;
  return String(n);
}

/** Normalize POIDS (decimal) input: strip leading zeros for whole numbers, keep decimals; allow "0." while typing */
function normalizePoidsInput(value: string): string {
  if (value === "") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed.endsWith(".")) return value;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n) || n < 0) return value;
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

export default function ProductionTrackingTable({ farmId, lot, semaine, sex, batiment, onSaveSuccess }: ProductionTrackingTableProps) {
  const { isReadOnly, canCreate, canUpdate } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SuiviProductionHebdoResponse | null>(null);

  const [venteNbre, setVenteNbre] = useState("");
  const [ventePoids, setVentePoids] = useState("");
  const [consoNbre, setConsoNbre] = useState("");
  const [consoPoids, setConsoPoids] = useState("");
  const [autreNbre, setAutreNbre] = useState("");
  const [autrePoids, setAutrePoids] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suiviProductionHebdo.get({ farmId, lot, semaine, sex, batiment: batiment ?? undefined });
      setData(res);
      setVenteNbre(res.venteNbre != null ? String(res.venteNbre) : "");
      setVentePoids(res.ventePoids != null ? String(res.ventePoids) : "");
      setConsoNbre(res.consoNbre != null ? String(res.consoNbre) : "");
      setConsoPoids(res.consoPoids != null ? String(res.consoPoids) : "");
      setAutreNbre(res.autreNbre != null ? String(res.autreNbre) : "");
      setAutrePoids(res.autrePoids != null ? String(res.autrePoids) : "");
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger le suivi de production.",
        variant: "destructive",
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, semaine, sex, batiment, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // REPORT = total from previous week (from API). TOTAL = REPORT + VENTE + CONSO + AUTRE (same as backend).
  const reportNbre = typeof data?.reportNbre === "number" ? data.reportNbre : (data?.reportNbre != null ? Number(data.reportNbre) : 0);
  const reportPoidsNum = typeof data?.reportPoids === "number" ? data.reportPoids : (data?.reportPoids != null ? Number(data.reportPoids) : 0);
  const reportPoids = Number.isFinite(reportPoidsNum) ? reportPoidsNum : 0;
  const vN = parseFloat(venteNbre) || 0;
  const vP = parseFloat(ventePoids) || 0;
  const cN = parseFloat(consoNbre) || 0;
  const cP = parseFloat(consoPoids) || 0;
  const aN = parseFloat(autreNbre) || 0;
  const aP = parseFloat(autrePoids) || 0;
  const totalNbre = (Number.isFinite(reportNbre) ? reportNbre : 0) + vN + cN + aN;
  const totalPoids = reportPoids + vP + cP + aP;

  // Permission: RESPONSABLE_FERME can create but not update; BACKOFFICE_EMPLOYER read-only
  const hasExistingRecord = data?.id != null;
  const canEditProduction = !isReadOnly && (hasExistingRecord ? canUpdate : canCreate);

  const handleSave = async () => {
    if (!canEditProduction) {
      toast({
        title: "Non autorisé",
        description: hasExistingRecord
          ? "Vous ne pouvez pas modifier un enregistrement déjà sauvegardé."
          : "Vous ne pouvez pas enregistrer.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const body: SuiviProductionHebdoRequest = {
        lot,
        semaine,
        sex,
        ...(batiment ? { batiment } : {}),
        venteNbre: venteNbre.trim() !== "" ? (Number.isInteger(vN) ? Math.round(vN) : vN) : null,
        ventePoids: ventePoids.trim() !== "" ? vP : null,
        consoNbre: consoNbre.trim() !== "" ? (Number.isInteger(cN) ? Math.round(cN) : cN) : null,
        consoPoids: consoPoids.trim() !== "" ? cP : null,
        autreNbre: autreNbre.trim() !== "" ? (Number.isInteger(aN) ? Math.round(aN) : aN) : null,
        autrePoids: autrePoids.trim() !== "" ? aP : null,
      };
      await api.suiviProductionHebdo.save(body, farmId);
      toast({ title: "Enregistré", description: "Suivi de production enregistré." });
      onSaveSuccess?.();
      await load();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement du suivi de production…</span>
      </div>
    );
  }

  const inputBase = "w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring " +
    (!canEditProduction ? "bg-muted/50 cursor-not-allowed" : "");
  const readOnlyCell = "px-2 py-1.5 text-sm text-center tabular-nums bg-muted/40 w-full min-w-[4rem]";
  const numericCellClass = "text-center tabular-nums min-w-[100px]";

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            Suivi de production
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lot {lot} — {semaine} — {sex}{batiment ? ` — ${batiment}` : ""}
          </p>
        </div>
        {!isReadOnly && (canCreate || canUpdate) && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEditProduction || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        )}
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
            {ROWS.map((row, index) => {
              const isReport = row.key === "report";
              const isTotal = row.isTotal;
              let nbreVal: string | number = "";
              let poidsVal: string | number = "";
              if (row.key === "report") {
                nbreVal = reportNbre;
                poidsVal = reportPoids;
              } else if (row.key === "vente") {
                nbreVal = venteNbre;
                poidsVal = ventePoids;
              } else if (row.key === "conso") {
                nbreVal = consoNbre;
                poidsVal = consoPoids;
              } else if (row.key === "autre") {
                nbreVal = autreNbre;
                poidsVal = autrePoids;
              } else {
                nbreVal = totalNbre;
                poidsVal = typeof totalPoids === "number" && Number.isFinite(totalPoids) ? totalPoids.toFixed(2) : totalPoids;
              }
              const readOnly = row.readOnly || !canEditProduction;
              return (
                <tr
                  key={row.key}
                  className={`border-b border-border ${
                    isReport ? "bg-amber-50 dark:bg-amber-950/20" : index % 2 === 0 ? "bg-card" : "bg-muted/20"
                  } ${isTotal ? "font-semibold bg-muted/50" : ""} hover:bg-muted/30 transition-colors`}
                >
                  <td className="px-4 py-2 border-r border-border">
                    <span className="font-medium text-foreground">{row.label}</span>
                  </td>
                  <td className={`border-r border-border align-middle ${numericCellClass}`}>
                    {readOnly ? (
                      <div className={readOnlyCell}>{typeof nbreVal === "number" ? nbreVal : (nbreVal || "0")}</div>
                    ) : (
                      <input
                        type="number"
                        value={nbreVal}
                        onChange={(e) => {
                          const next = normalizeNbreInput(e.target.value);
                          if (row.key === "vente") setVenteNbre(next);
                          if (row.key === "conso") setConsoNbre(next);
                          if (row.key === "autre") setAutreNbre(next);
                        }}
                        min={0}
                        className={inputBase}
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className={`align-middle ${numericCellClass}`}>
                    {readOnly ? (
                      <div className={readOnlyCell}>{typeof poidsVal === "number" ? poidsVal : (poidsVal || "0")}</div>
                    ) : (
                      <input
                        type="number"
                        value={poidsVal}
                        onChange={(e) => {
                          const next = normalizePoidsInput(e.target.value);
                          if (row.key === "vente") setVentePoids(next);
                          if (row.key === "conso") setConsoPoids(next);
                          if (row.key === "autre") setAutrePoids(next);
                        }}
                        min={0}
                        step="0.01"
                        className={inputBase}
                        placeholder="0"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
