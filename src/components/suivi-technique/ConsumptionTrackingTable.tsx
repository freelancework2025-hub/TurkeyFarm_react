import { useState, useEffect, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import { api, type SuiviConsommationHebdoResponse, type SuiviConsommationHebdoRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type RowKey = "consommation_aliment" | "cumul_aliment" | "indice_eau_aliment" | "conso_kg_j";

interface ConsumptionRow {
  key: RowKey;
  label: string;
  editable: boolean;
  unit?: string;
}

// Cumul = sum S1..N; Indice EAU/ALIMENT = totalEauSemaine (L) / consommationAlimentSemaine (kg); CONSO Kg/J = consommationAlimentSemaine / 7 (backend-computed).
const ROWS: ConsumptionRow[] = [
  { key: "consommation_aliment", label: "CONSOMMATION ALIMENT", editable: true, unit: "kg" },
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
}

/** Normalize decimal input: strip leading zeros; allow "0." while typing */
function normalizeDecimalInput(value: string): string {
  if (value === "") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed.endsWith(".")) return value;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n) || n < 0) return value;
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

export default function ConsumptionTrackingTable({ farmId, lot, semaine, sex, batiment, onSaveSuccess }: ConsumptionTrackingTableProps) {
  const { isReadOnly, canCreate, canUpdate } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SuiviConsommationHebdoResponse | null>(null);
  const [consommationAliment, setConsommationAliment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suiviConsommationHebdo.get({ farmId, lot, semaine, sex, batiment: batiment ?? undefined });
      setData(res);
      setConsommationAliment(
        res.consommationAlimentSemaine != null ? String(res.consommationAlimentSemaine) : ""
      );
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
  }, [farmId, lot, semaine, sex, batiment, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const hasExistingRecord = data?.id != null;
  const canEditConsumption = !isReadOnly && (hasExistingRecord ? canUpdate : canCreate);

  const handleSave = async () => {
    if (!canEditConsumption) {
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
      const kg = consommationAliment.trim() === "" ? null : parseFloat(consommationAliment);
      const body: SuiviConsommationHebdoRequest = {
        lot,
        semaine,
        sex,
        ...(batiment ? { batiment } : {}),
        consommationAlimentKg: kg != null && !Number.isNaN(kg) ? kg : null,
      };
      await api.suiviConsommationHebdo.save(body, farmId);
      toast({ title: "Enregistré", description: "Suivi de consommation enregistré." });
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
        <span>Chargement du suivi de consommation…</span>
      </div>
    );
  }

  const cumul = data?.cumulAlimentConsomme != null ? Number(data.cumulAlimentConsomme) : null;
  const indice = data?.indiceEauAliment != null ? Number(data.indiceEauAliment) : null;
  const consoKgJ = data?.consoAlimentKgParJour != null ? Number(data.consoAlimentKgParJour) : null;

  const inputBase =
    "w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring " +
    (!canEditConsumption ? "bg-muted/50 cursor-not-allowed" : "");
  const readOnlyCell = "px-4 py-2 text-sm text-center tabular-nums bg-muted/40";

  const formatValue = (val: number | null | undefined, unit?: string): string => {
    if (val == null || Number.isNaN(val)) return "—";
    const s = Number.isInteger(val) ? String(val) : val.toFixed(2).replace(".", ",");
    return unit ? `${s} ${unit}` : s;
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            Suivi de consommation
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lot {lot} — {semaine} — {sex}{batiment ? ` — ${batiment}` : ""}
          </p>
        </div>
        {!isReadOnly && (canCreate || canUpdate) && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEditConsumption || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm border-collapse">
          <tbody>
            {ROWS.map((row, index) => {
              const isEditable = row.editable && canEditConsumption;
              let displayValue: React.ReactNode;
              if (row.key === "consommation_aliment") {
                displayValue = isEditable ? (
                  <input
                    type="number"
                    value={consommationAliment}
                    onChange={(e) => setConsommationAliment(normalizeDecimalInput(e.target.value))}
                    min={0}
                    step="0.01"
                    className={inputBase}
                    placeholder="0"
                  />
                ) : (
                  <div className={readOnlyCell}>
                    {consommationAliment.trim() !== "" ? `${consommationAliment} kg` : "—"}
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
