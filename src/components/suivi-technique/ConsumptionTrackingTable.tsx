import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { api, type SuiviConsommationHebdoResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type RowKey = "consommation_aliment" | "cumul_aliment" | "indice_eau_aliment" | "conso_kg_j";

interface ConsumptionRow {
  key: RowKey;
  label: string;
  editable: boolean;
  unit?: string;
}

// CONSOMMATION ALIMENT is calculated: Stock(S_{N-1}) + Livraisons(S_N) - Stock(S_N). User enters Stock in STOCK table; consumption is computed on save.
// Cumul = sum S1..N; Indice EAU/ALIMENT = totalEauSemaine (L) / consommationAlimentSemaine (kg); CONSO Kg/J = backend-computed.
const ROWS: ConsumptionRow[] = [
  { key: "consommation_aliment", label: "CONSOMMATION ALIMENT", editable: false, unit: "kg" },
  { key: "cumul_aliment", label: "CUMUL ALIMENT CONSOMMÉ", editable: false, unit: "kg" },
  { key: "indice_eau_aliment", label: "INDICE EAU/ALIMENT", editable: false },
  { key: "conso_kg_j", label: "CONSO ALIMENT Kg/J", editable: false, unit: "Kg/J" },
];

interface ConsumptionTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Bâtiment (Lot → Semaine → Batiment workflow). */
  batiment?: string;
  /** Called after consumption is saved so parent can refresh stock. */
  onSaveSuccess?: () => void;
  /** When this key changes, consumption data is refetched (e.g. after hebdo eau save) so INDICE EAU/ALIMENT and other computed fields update. */
  refreshKey?: number;
}

export default function ConsumptionTrackingTable({ farmId, lot, semaine, sex, batiment, onSaveSuccess, refreshKey }: ConsumptionTrackingTableProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SuiviConsommationHebdoResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suiviConsommationHebdo.get({ farmId, lot, semaine, sex, batiment: batiment ?? undefined });
      setData(res);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger le suivi de consommation.",
        variant: "destructive",
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, semaine, sex, batiment, toast, refreshKey]);

  // Refetch when refreshKey changes (e.g. after stock aliment save) so CONSOMMATION ALIMENT — S1 updates.
  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement du suivi de consommation…</span>
      </div>
    );
  }

  const cumul = data?.cumulAlimentConsomme != null ? Number(data.cumulAlimentConsomme) : null;
  const indice = data?.indiceEauAliment != null ? Number(data.indiceEauAliment) : null;
  const consoKgJ = data?.consoAlimentKgParJour != null ? Number(data.consoAlimentKgParJour) : null;

  const readOnlyCell = "px-4 py-2 text-sm text-center tabular-nums bg-muted/40";

  const formatValue = (val: number | null | undefined, unit?: string): string => {
    if (val == null || Number.isNaN(val)) return "—";
    const s = Number.isInteger(val) ? String(val) : val.toFixed(2).replace(".", ",");
    return unit ? `${s} ${unit}` : s;
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
          Suivi de consommation
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Lot {lot} — {semaine} — {sex}{batiment ? ` — ${batiment}` : ""}. Consommation = Stock précédent (sexe) + Quantité livrée globale de la semaine — Stock actuel (sexe).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm border-collapse">
          <tbody>
            {ROWS.map((row, index) => {
              let displayValue: React.ReactNode;
              if (row.key === "consommation_aliment") {
                displayValue = (
                  <div className={readOnlyCell}>
                    {formatValue(data?.consommationAlimentSemaine != null ? Number(data.consommationAlimentSemaine) : null, "kg")}
                  </div>
                );
              } else if (row.key === "cumul_aliment") {
                displayValue = <div className={readOnlyCell}>{formatValue(cumul, "kg")}</div>;
              } else if (row.key === "indice_eau_aliment") {
                displayValue = <div className={readOnlyCell}>{formatValue(indice)}</div>;
              } else {
                displayValue = <div className={readOnlyCell}>{formatValue(consoKgJ, "Kg/J")}</div>;
              }
              return (
                <tr
                  key={row.key}
                  className={`border-b border-border ${
                    index % 2 === 0 ? "bg-card" : "bg-muted/20"
                  } hover:bg-muted/30 transition-colors`}
                >
                  <td className="px-4 py-2 border-r border-border">
                    <span className="font-medium text-foreground">
                      {row.key === "consommation_aliment" ? `${row.label} — ${semaine}` : row.label}
                    </span>
                  </td>
                  <td className="align-middle">{displayValue}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
