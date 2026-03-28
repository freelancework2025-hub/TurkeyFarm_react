import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { api, type SuiviConsommationHebdoResponse } from "@/lib/api";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";
import { useToast } from "@/hooks/use-toast";

type RowKey = "consommation_aliment" | "cumul_aliment" | "indice_eau_aliment" | "conso_kg_j";

interface ConsumptionRow {
  key: RowKey;
  label: string;
  editable: boolean;
  unit?: string;
}

// Backend computes consommation_aliment_kg and cumul from DB (stock_aliment_hebdo + aliment_movement). React only reads from API; no client-side calculation.
// Rule (backend): B1 = Stock_prev + Livraisons − Stock_actuel; B2+ = Stock_transfer − Stock_actuel.
// CUMUL (Sn) = totaux chaîne S1…S(n−1) (par sexe) + somme sur la chaîne jusqu’au bâtiment courant pour Sn.
// INDICE EAU/ALIMENT (par bâtiment, même sexe que la vue) =
//   TOTAL S de CONSO. EAU (L) pour ce bâtiment / CONSOMMATION ALIMENT — S (kg) pour ce bâtiment
//   = totalEauSemaineL / consommationAlimentSemaine. Affiché via indiceEauAliment (API) avec repli calcul local.
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
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, semaine, sex, batiment, toast, refreshKey]);

  // Refetch when refreshKey changes (e.g. after stock aliment save) so CONSOMMATION ALIMENT updates for S1 and S2+.
  // Backend computes conso from stock (and livraisons when present); livraisons may be 0 — we display the returned value (including 0).
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

  // Per-week isolation: CUMUL = 0 until CONSOMMATION ALIMENT for this semaine is calculated (each sex has own cumul)
  const consoSemaine = data?.consommationAlimentSemaine;
  const cumul: number | null =
    consoSemaine != null
      ? (data?.cumulAlimentConsomme != null ? Number(data.cumulAlimentConsomme) : 0)
      : 0; // 0 until current week's consumption is calculated
  const totalEauL =
    data?.totalEauSemaineL != null && Number.isFinite(Number(data.totalEauSemaineL))
      ? Number(data.totalEauSemaineL)
      : null;
  const consoKgForIndice =
    consoSemaine != null && Number.isFinite(Number(consoSemaine)) ? Number(consoSemaine) : null;
  const indiceFromApi =
    data?.indiceEauAliment != null && Number.isFinite(Number(data.indiceEauAliment))
      ? Number(data.indiceEauAliment)
      : null;
  const indiceComputed =
    totalEauL != null &&
    consoKgForIndice != null &&
    consoKgForIndice > 0 &&
    Number.isFinite(totalEauL)
      ? totalEauL / consoKgForIndice
      : null;
  /** Préférence backend (même formule), repli si indice absent */
  const indice = indiceFromApi ?? indiceComputed;
  const consoKgJ = data?.consoAlimentKgParJour != null ? Number(data.consoAlimentKgParJour) : null;

  const readOnlyCell = "px-4 py-2 text-sm text-center tabular-nums bg-muted/40";

  // Display backend value as-is: 0 and any positive number are valid (conso computed from stock ± livraisons).
  const formatValue = (val: number | null | undefined, unit?: string): string => {
    if (val == null || Number.isNaN(val)) return "—";
    const s = Number.isInteger(val) ? formatGroupedNumber(val, 0) : formatGroupedNumber(val, 2);
    return unit ? `${s} ${unit}` : s;
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
          Suivi de consommation
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Lot {lot} — {semaine} — {sex}{batiment ? ` — ${batiment}` : ""}. B1 : Stock_prev + Livraisons − Stock. B2+ : Stock_transfer − Stock. CUMUL inclut les semaines précédentes (totaux chaîne par sexe) + la semaine courante jusqu&apos;à ce bâtiment. CUMUL affiché 0 tant que la conso de la semaine n&apos;est pas calculée.
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
                displayValue = (
                  <div
                    className={readOnlyCell}
                    title="TOTAL S de CONSO. EAU (L) du bâtiment ÷ CONSOMMATION ALIMENT — S du bâtiment (L/kg)"
                  >
                    {formatValue(indice)}
                  </div>
                );
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
