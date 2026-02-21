import { useState, useEffect, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import {
  api,
  type SuiviPerformancesHebdoResponse,
  type SuiviPerformancesHebdoRequest,
  type PerformanceNormeRequest,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type MetricKey =
  | "poidsMoyen"
  | "homogeneite"
  | "indiceConsommation"
  | "gmq"
  | "viabilite";

interface MetricRow {
  key: MetricKey;
  label: string;
  unit?: string;
}

const ROWS: MetricRow[] = [
  { key: "poidsMoyen", label: "POIDS MOYEN (g)", unit: "g" },
  { key: "homogeneite", label: "HOMOGÉNÉITÉ (%)", unit: "%" },
  { key: "indiceConsommation", label: "INDICE DE CONSOMMATION" },
  { key: "gmq", label: "GMQ (g/jour)", unit: "g/j" },
  { key: "viabilite", label: "VIABILITÉ", unit: "%" },
];

/** REEL computed by backend: Indice = CUMUL ALIMENT CONSOMMÉ / POIDS VIF PRODUIT (kg); Viabilité = 100% − cumul mortalité % fin de semaine */
const COMPUTED_REEL_KEYS: MetricKey[] = ["indiceConsommation", "viabilite"];
function isReelComputed(key: MetricKey): boolean {
  return COMPUTED_REEL_KEYS.includes(key);
}

function toNum(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return v;
}

function formatVal(value: number | null | undefined, unit?: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const s = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}

function normalizeDecimalInput(value: string): string {
  if (value === "") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed.endsWith(".")) return value;
  const n = parseFloat(trimmed.replace(",", "."));
  if (Number.isNaN(n)) return value;
  return trimmed;
}

interface PerformanceTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Bâtiment (Lot → Semaine → Batiment workflow). */
  batiment?: string;
}

export default function PerformanceTrackingTable({
  farmId,
  lot,
  semaine,
  sex,
  batiment,
}: PerformanceTrackingTableProps) {
  const { isReadOnly, canCreate, canUpdate } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SuiviPerformancesHebdoResponse | null>(null);

  const [reel, setReel] = useState<Record<MetricKey, string>>({
    poidsMoyen: "",
    homogeneite: "",
    indiceConsommation: "",
    gmq: "",
    viabilite: "",
  });
  const [norme, setNorme] = useState<Record<MetricKey, string>>({
    poidsMoyen: "",
    homogeneite: "",
    indiceConsommation: "",
    gmq: "",
    viabilite: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.suiviPerformancesHebdo.get({
        farmId,
        lot,
        semaine,
        sex,
        batiment: batiment ?? undefined,
      });
      setData(res);
      setReel({
        poidsMoyen: res.poidsMoyenReel != null ? String(res.poidsMoyenReel) : "",
        homogeneite: res.homogeneiteReel != null ? String(res.homogeneiteReel) : "",
        indiceConsommation:
          res.indiceConsommationReel != null ? String(res.indiceConsommationReel) : "",
        gmq: res.gmqReel != null ? String(res.gmqReel) : "",
        viabilite: res.viabiliteReel != null ? String(res.viabiliteReel) : "",
      });
      setNorme({
        poidsMoyen: res.poidsMoyenNorme != null ? String(res.poidsMoyenNorme) : "",
        homogeneite: res.homogeneiteNorme != null ? String(res.homogeneiteNorme) : "",
        indiceConsommation:
          res.indiceConsommationNorme != null ? String(res.indiceConsommationNorme) : "",
        gmq: res.gmqNorme != null ? String(res.gmqNorme) : "",
        viabilite: res.viabiliteNorme != null ? String(res.viabiliteNorme) : "",
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description:
          e instanceof Error ? e.message : "Impossible de charger le suivi de performances.",
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
  /** REEL: editable only when (no record yet and can create) or (record exists and can update). RESPONSABLE_FERME cannot modify after saving (permission.mdc). */
  const canEditReel = !isReadOnly && (hasExistingRecord ? canUpdate : canCreate);
  /** NORME: editable only by ADMINISTRATEUR / RESPONSABLE_TECHNIQUE */
  const canEditNorme = !isReadOnly && canUpdate;

  const setReelField = (key: MetricKey, value: string) => {
    setReel((prev) => ({ ...prev, [key]: normalizeDecimalInput(value) }));
  };
  const setNormeField = (key: MetricKey, value: string) => {
    setNorme((prev) => ({ ...prev, [key]: normalizeDecimalInput(value) }));
  };

  const parseOptional = (s: string): number | null => {
    const t = s.trim().replace(",", ".");
    if (t === "") return null;
    const n = parseFloat(t);
    return Number.isNaN(n) ? null : n;
  };

  /** Build REEL request body (NORME is saved separately via performanceNorme endpoint). */
  const buildReelBody = (): SuiviPerformancesHebdoRequest => ({
    lot,
    semaine,
    sex,
    ...(batiment ? { batiment } : {}),
    poidsMoyenReel: parseOptional(reel.poidsMoyen),
    homogeneiteReel: parseOptional(reel.homogeneite),
    indiceConsommationReel: null,
    gmqReel: parseOptional(reel.gmq),
    viabiliteReel: null,
  });

  /** Build NORME request body (shared across all lots and batiments). */
  const buildNormeBody = (): PerformanceNormeRequest => ({
    semaine,
    sex,
    poidsMoyenNorme: parseOptional(norme.poidsMoyen),
    homogeneiteNorme: parseOptional(norme.homogeneite),
    indiceConsommationNorme: parseOptional(norme.indiceConsommation),
    gmqNorme: parseOptional(norme.gmq),
    viabiliteNorme: parseOptional(norme.viabilite),
  });

  const handleSave = async (normeOnly = false) => {
    if (normeOnly && !canEditNorme) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas modifier les normes.", variant: "destructive" });
      return;
    }
    if (!normeOnly && !canEditReel) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas modifier ce suivi.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (normeOnly) {
        await api.performanceNorme.save(buildNormeBody(), farmId);
        toast({ title: "Enregistré", description: "Normes enregistrées (appliquées à tous les lots et bâtiments)." });
      } else {
        await api.suiviPerformancesHebdo.save(buildReelBody(), farmId);
        toast({ title: "Enregistré", description: "Suivi de performances REEL enregistré." });
      }
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

  /** Écart = REEL − NORME, always computed from current REEL and NORME (form + data for computed rows). */
  const getReelValue = (key: MetricKey): number | null => {
    if (key === "indiceConsommation") return toNum(data?.indiceConsommationReel);
    if (key === "viabilite") return toNum(data?.viabiliteReel);
    return parseOptional(reel[key]);
  };

  const getNormeValue = (key: MetricKey): number | null => parseOptional(norme[key]);

  const ecart = (key: MetricKey): number | null => {
    const r = getReelValue(key);
    const n = getNormeValue(key);
    if (r == null && n == null) return null;
    if (r == null) return n != null ? -n : null;
    if (n == null) return r;
    return r - n;
  };

  const inputBase =
    "w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring ";
  const inputDisabled = "bg-muted/50 cursor-not-allowed";
  const normeCellReadOnly =
    "px-3 py-2 text-sm text-center tabular-nums bg-amber-50 dark:bg-amber-950/30 text-foreground";
  const ecartCell = "px-3 py-2 text-sm text-center tabular-nums bg-muted/40 text-foreground";

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement du suivi de performances…</span>
      </div>
    );
  }

  const showSaveReel = !isReadOnly && canEditReel;
  /** NORME is shared across all lots/batiments, so it can be saved independently of REEL record existence. */
  const showSaveNorme = !isReadOnly && canEditNorme;

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-display font-bold text-foreground underline decoration-primary/40">
            Suivi de PERFORMANCES
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lot {lot} — {semaine} — {sex}{batiment ? ` — ${batiment}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showSaveReel && (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer REEL
            </button>
          )}
          {showSaveNorme && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer NORME
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-semibold text-foreground w-[220px]">
                INDICATEUR
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-l border-border">
                REEL
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-l border-border bg-amber-50 dark:bg-amber-950/20">
                NORME
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-l border-border bg-muted/50">
                ÉCART
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, index) => {
              const displayEcart = ecart(row.key);
              const rowUnit = row.unit;
              return (
                <tr
                  key={row.key}
                  className={`border-b border-border ${
                    index % 2 === 0 ? "bg-card" : "bg-muted/10"
                  } hover:bg-muted/20 transition-colors`}
                >
                  <td className="px-4 py-2 border-r border-border font-medium text-foreground">
                    {row.label}
                  </td>
                  <td className="align-middle border-l border-border">
                    {isReelComputed(row.key) ? (
                      <div className={ecartCell} title={row.key === "indiceConsommation" ? "Calculé automatiquement : CUMUL ALIMENT CONSOMMÉ / POIDS VIF PRODUIT (kg)" : "100% − cumul mortalité % fin de semaine"}>
                        {formatVal(
                          row.key === "indiceConsommation" ? toNum(data?.indiceConsommationReel) : toNum(data?.viabiliteReel),
                          row.unit
                        )}
                      </div>
                    ) : canEditReel ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={reel[row.key]}
                        onChange={(e) => setReelField(row.key, e.target.value)}
                        className={inputBase}
                        placeholder="—"
                      />
                    ) : (
                      <div className={ecartCell}>
                        {reel[row.key].trim() !== ""
                          ? formatVal(parseOptional(reel[row.key]), rowUnit)
                          : "—"}
                      </div>
                    )}
                  </td>
                  <td className={`align-middle border-l border-border ${!canEditNorme ? normeCellReadOnly : ""}`}>
                    {canEditNorme ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={norme[row.key]}
                        onChange={(e) => setNormeField(row.key, e.target.value)}
                        className={inputBase + " bg-amber-50/50 dark:bg-amber-950/20"}
                        placeholder="—"
                      />
                    ) : (
                      <div className={normeCellReadOnly}>
                        {norme[row.key].trim() !== ""
                          ? formatVal(parseOptional(norme[row.key]), rowUnit)
                          : "—"}
                      </div>
                    )}
                  </td>
                  <td className={`align-middle border-l border-border ${ecartCell}`}>
                    {formatVal(displayEcart, rowUnit)}
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
