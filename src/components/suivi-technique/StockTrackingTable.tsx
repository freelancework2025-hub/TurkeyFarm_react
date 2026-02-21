import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api, type SuiviStockResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface StockTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Batiment for batiment-specific stock (Lot → Semaine → Batiment workflow). */
  batiment?: string;
  /** When this changes, stock is refetched (e.g. after saving hebdo/production/consumption). */
  refreshKey?: number;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}

export default function StockTrackingTable({
  farmId,
  lot,
  semaine,
  sex,
  batiment,
  refreshKey = 0,
}: StockTrackingTableProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SuiviStockResponse | null>(null);

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
    } catch (e) {
      toast({
        title: "Erreur",
        description:
          e instanceof Error ? e.message : "Impossible de charger le suivi de stock.",
        variant: "destructive",
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, semaine, sex, batiment, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement du suivi de stock…</span>
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    {
      label: "EFFECTIF RESTANT FIN DE SEMAINE",
      value: formatNumber(data?.effectifRestantFinSemaine ?? null),
    },
    {
      label: "POIDS VIF PRODUIT EN KG",
      value: formatNumber(data?.poidsVifProduitKg ?? null),
    },
    {
      label: "STOCK ALIMENT",
      value: formatNumber(data?.stockAliment ?? null),
    },
  ];

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
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title="Recalculer les indicateurs (effectif restant, poids vif, stock aliment)"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Rafraîchir
        </button>
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
            {rows.map((row, index) => (
              <tr
                key={row.label}
                className={`border-b border-border ${
                  index % 2 === 0 ? "bg-card" : "bg-muted/10"
                } hover:bg-muted/20 transition-colors`}
              >
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  {row.label}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
