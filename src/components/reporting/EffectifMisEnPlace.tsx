import { useState, useEffect, useCallback } from "react";
import { Loader2, Info } from "lucide-react";
import { api, type SetupInfoResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";
import {
  REPORTING_EFFECTIF_TABLE_HEADERS,
  REPORTING_EFFECTIF_HEADER_CLASS,
} from "@/lib/reportingJournalierShared";

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function formatEffectifDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 0) : "—";
}

interface SetupInfoRow {
  id: string;
  lot: string;
  dateMiseEnPlace: string;
  heureMiseEnPlace: string;
  building: string;
  sex: string;
  effectifMisEnPlace: string;
  typeElevage: string;
  origineFournisseur: string;
  dateEclosion: string;
  souche: string;
}

function toRow(s: SetupInfoResponse): SetupInfoRow {
  return {
    id: String(s.id),
    lot: s.lot,
    dateMiseEnPlace: s.dateMiseEnPlace,
    heureMiseEnPlace: s.heureMiseEnPlace,
    building: s.building,
    sex: s.sex,
    effectifMisEnPlace: String(s.effectifMisEnPlace),
    typeElevage: s.typeElevage,
    origineFournisseur: s.origineFournisseur,
    dateEclosion: s.dateEclosion,
    souche: s.souche,
  };
}

interface EffectifMisEnPlaceProps {
  /** When set (Admin/RT), list and create are scoped to this farm. */
  farmId?: number | null;
  /** When set (e.g. from Reporting Journalier lot selector), list is filtered to this lot. */
  lot?: string | null;
}

export default function EffectifMisEnPlace({ farmId, lot }: EffectifMisEnPlaceProps = {}) {
  const { selectedFarmName, allFarmsMode } = useAuth();
  const selectedLot = lot?.trim() || null;
  const [rows, setRows] = useState<SetupInfoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.setupInfo.list(farmId ?? undefined, selectedLot);
      const mapped = list.map(toRow);
      setRows(mapped);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [farmId, selectedLot]);

  useEffect(() => {
    load();
  }, [load]);

  const totalMale = rows
    .filter((r) => r.sex === "Mâle")
    .reduce((sum, r) => sum + toNum(r.effectifMisEnPlace), 0);
  const totalFemale = rows
    .filter((r) => r.sex === "Femelle")
    .reduce((sum, r) => sum + toNum(r.effectifMisEnPlace), 0);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des effectifs…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">
              Effectif Mis en Place
            </h2>
            <p className="text-xs text-muted-foreground">
              Données issues de la configuration initiale (Données mises en place)
            </p>
          </div>
        </div>
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Info className="w-8 h-8" />
          <p className="text-sm text-center">
            Aucune configuration de setup trouvée pour ce lot.<br />
            Veuillez d'abord configurer les données mises en place dans la page "Données mises en place".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">
            Effectif Mis en Place
          </h2>
          <p className="text-xs text-muted-foreground">
            {allFarmsMode
              ? "Données issues de la configuration initiale — Données mises en place (toutes fermes)"
              : selectedFarmName
                ? `Ferme : ${selectedFarmName} — Données issues de la configuration initiale`
                : "Données issues de la configuration initiale (Données mises en place)"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-farm">
          <thead>
            <tr>
              {REPORTING_EFFECTIF_TABLE_HEADERS.map((h) => (
                <th key={h} className={REPORTING_EFFECTIF_HEADER_CLASS[h]}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="text-sm">{row.dateMiseEnPlace}</td>
                <td className="text-sm">{row.heureMiseEnPlace}</td>
                <td className="text-sm font-medium">{row.building}</td>
                <td className="text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.sex === "Mâle" 
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" 
                      : "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                  }`}>
                    {row.sex}
                  </span>
                </td>
                <td className="text-sm font-bold text-center tabular-nums whitespace-nowrap">
                  {formatEffectifDisplay(row.effectifMisEnPlace)}
                </td>
                <td className="text-sm">{row.typeElevage}</td>
                <td className="text-sm">{row.origineFournisseur}</td>
                <td className="text-sm">{row.souche}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60">
              <td colSpan={4} className="text-right font-semibold text-sm px-3 py-2 text-muted-foreground">
                Total Mâle / Femelle :
              </td>
              <td className="px-3 py-2 font-bold text-sm text-center tabular-nums whitespace-nowrap">
                {formatGroupedNumber(totalMale, 0)} / {formatGroupedNumber(totalFemale, 0)}
              </td>
              <td colSpan={3}></td>
            </tr>
            <tr className="bg-muted/60">
              <td colSpan={4} className="text-right font-semibold text-sm px-3 py-2 text-muted-foreground">
                Total Général :
              </td>
              <td className="px-3 py-2 font-bold text-sm text-accent text-center tabular-nums whitespace-nowrap">
                {formatGroupedNumber(totalMale + totalFemale, 0)}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
