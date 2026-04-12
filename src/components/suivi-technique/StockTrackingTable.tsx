import { useState, useEffect, useCallback } from "react";
import { Loader2, Save } from "lucide-react";
import { api, type SuiviStockResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";

interface StockTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Batiment for batiment-specific stock (Lot → Semaine → Batiment workflow). When set, STOCK ALIMENT is user-entered (editable). */
  batiment?: string;
  /** When this changes, stock is refetched (e.g. after saving hebdo/production/consumption). */
  refreshKey?: number;
  /** Called after stock aliment is saved (e.g. to refresh consumption table). */
  onSaveSuccess?: () => void;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? formatGroupedNumber(value, 0) : formatGroupedNumber(value, 2);
}

function normalizeDecimalInput(value: string): string {
  if (value === "") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed.endsWith(".")) return value;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n) || n < 0) return value;
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

export default function StockTrackingTable({
  farmId,
  lot,
  semaine,
  sex,
  batiment,
  refreshKey = 0,
  onSaveSuccess,
}: StockTrackingTableProps) {
  const { toast } = useToast();
  const { isReadOnly, canCreate, canUpdate } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SuiviStockResponse | null>(null);
  const [stockAlimentInput, setStockAlimentInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suiviStock.get({
        farmId,
        lot,
        semaine,
        sex,
        batiment: batiment ?? undefined,
      });
      setData(res);
      setStockAlimentInput(
        res.stockAliment != null ? String(res.stockAliment) : ""
      );
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, semaine, sex, batiment, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // RESPONSABLE_FERME: can create (first save) but cannot update (modify after saving). Use backend flag to show edit only when no record exists (canCreate) or user has canUpdate.
  const stockRecordExists = Boolean(data?.stockAlimentRecordExists);
  const canEditStock =
    Boolean(batiment) &&
    !isReadOnly &&
    (stockRecordExists ? canUpdate : canCreate);

  const handleSaveStockAliment = async () => {
    if (!canEditStock) return;
    setSaving(true);
    try {
      const kg = stockAlimentInput.trim() === "" ? null : parseFloat(stockAlimentInput);
      await api.suiviStock.saveStockAliment(
        { farmId, lot, semaine, sex, batiment: batiment ?? undefined },
        {
          lot,
          semaine,
          sex,
          batiment: batiment ?? undefined,
          stockAlimentKg: kg != null && !Number.isNaN(kg) ? kg : null,
        }
      );
      toast({ title: "Enregistré", description: "Stock aliment enregistré. Consommation calculée automatiquement." });
      onSaveSuccess?.();
      await load();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement du suivi de stock…</span>
      </div>
    );
  }

  const inputBase =
    "w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring " +
    (!canEditStock ? "bg-muted/50 cursor-not-allowed" : "");

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            STOCK
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lot {lot} — {semaine} — {sex}{batiment ? ` — ${batiment}` : ""}
          </p>
        </div>
        {canEditStock && (
          <button
            type="button"
            onClick={handleSaveStockAliment}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-semibold text-foreground w-[280px]">
                INDICATEUR
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-l border-border">
                VALEUR
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border bg-card hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                EFFECTIF RESTANT FIN DE SEMAINE
              </td>
              <td className={`px-3 py-2.5 text-center tabular-nums border-l border-border bg-muted/20 ${
                (data?.effectifRestantFinSemaine ?? 0) < 0 ? 'text-red-600 font-semibold' : 'text-foreground'
              }`}>
                {formatNumber(data?.effectifRestantFinSemaine ?? null)}
              </td>
            </tr>
            <tr className="border-b border-border bg-muted/10 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                POIDS VIF PRODUIT EN KG
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                {formatNumber(data?.poidsVifProduitKg ?? null)}
              </td>
            </tr>
            <tr className="border-b border-border bg-card hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                STOCK ALIMENT — {semaine}
              </td>
              <td className="px-3 py-2.5 border-l border-border bg-muted/20">
                {batiment && canEditStock ? (
                  <input
                    type="number"
                    value={stockAlimentInput}
                    onChange={(e) => setStockAlimentInput(normalizeDecimalInput(e.target.value))}
                    min={0}
                    step="0.01"
                    className={inputBase}
                    placeholder="Saisir"
                  />
                ) : (
                  <span className="block text-center tabular-nums text-foreground">
                    {formatNumber(data?.stockAliment ?? null)}
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
