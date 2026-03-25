/**
 * Résumé des coûts hebdomadaires — Prix de revient table.
 * Columns: DESIGNATION, Semaine choisie S1, Cumul, Cumul DH/KG, %
 * - Cumul DH/KG = cumul / POIDS VIF PRODUIT EN KG (from STOCK — Tous bâtiments — S1)
 * - % = cumul / total of all cumuls
 * S1 (and cumul) for AMORTISSEMENT and DINDONNEAUX: only ADMINISTRATEUR and RESPONSABLE_TECHNIQUE can edit.
 * RESPONSABLE_FERME and others: read-only (permission.mdc).
 */

import { useState, useMemo } from "react";
import { api, type SuiviCoutHebdoResponse } from "@/lib/api";
import { formatGroupedNumber, formatResumeAmount, toOptionalNumber } from "@/lib/formatResumeAmount";
import { buildDisplayRows, getEffectiveCumul, toNum } from "@/lib/resumeCoutsHebdoDisplay";
import { Loader2 } from "lucide-react";

export interface ResumeCoutsHebdoTableProps {
  /** Semaine label (e.g. S1) for the header */
  semaine: string;
  /** Cost lines from API (e.g. AMORTISSEMENT) */
  rows: SuiviCoutHebdoResponse[];
  /** Read-only rows from module totals (ALIMENT, PDTS VETERINAIRES, etc.): S1 = total Montant for the chosen week */
  computedRows?: { designation: string; valeurS1: number | null; cumul: number | null }[];
  /** POIDS VIF PRODUIT EN KG from STOCK — Tous bâtiments — S1 (Résumé hebdomadaire de la production) */
  poidsVifProduitKg: number | null;
  /** EFFECTIF RESTANT FIN DE SEMAINE from production résumé (for PRIX DE REVIENT/SUJET and /KG) */
  effectifRestantFinSemaine?: number | null;
  /** Total NB de production (report + vente + conso + autre) from production résumé */
  totalNbreProduction?: number | null;
  /** PRIX DE REVIENT/SUJET — from backend when available (avoids client calc) */
  prixRevientParSujet?: number | null;
  /** PRIX DE REVIENT/KG — from backend when available (avoids client calc) */
  prixRevientParKg?: number | null;
  /** User can create new rows. Not used for AMORTISSEMENT/DINDONNEAUX (those require canUpdate). */
  canCreate: boolean;
  /** User can edit AMORTISSEMENT and DINDONNEAUX. Only ADMINISTRATEUR and RESPONSABLE_TECHNIQUE (permission.mdc). */
  canUpdate: boolean;
  farmId: number;
  lot: string;
  /** Callback after save to refresh the list */
  onSaveSuccess?: () => void;
}

const DESIGNATION_AMORTISSEMENT = "AMORTISSEMENT";
const DESIGNATION_DINDONNEAUX = "DINDONNEAUX";

/** Designations whose S1 and CUMUL are saisie by responsable technique only. */
const EDITABLE_DESIGNATIONS = [DESIGNATION_AMORTISSEMENT, DESIGNATION_DINDONNEAUX] as const;

function isEditableByRespTech(designation: string | null | undefined): boolean {
  const d = designation?.toUpperCase();
  return EDITABLE_DESIGNATIONS.some((ed) => ed === d);
}

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${formatGroupedNumber(value, 2)} %`;
}

/** Row is saved when it has a persistent id from API (id > 0). Placeholders have id 0; computed rows id < 0. */
function isRowSaved(row: SuiviCoutHebdoResponse): boolean {
  return row.id != null && row.id > 0;
}

export default function ResumeCoutsHebdoTable({
  semaine,
  rows,
  computedRows = [],
  poidsVifProduitKg,
  effectifRestantFinSemaine,
  totalNbreProduction,
  prixRevientParSujet,
  prixRevientParKg,
  canCreate,
  canUpdate,
  farmId,
  lot,
  onSaveSuccess,
}: ResumeCoutsHebdoTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editValeurS1, setEditValeurS1] = useState<string>("");
  const [editCumul, setEditCumul] = useState<string>("");

  /**
   * AMORTISSEMENT and DINDONNEAUX: only RESPONSABLE_TECHNIQUE and ADMINISTRATEUR can edit (create or update).
   * RESPONSABLE_FERME and others read-only per permission.mdc.
   */
  const canEditRow = (row: SuiviCoutHebdoResponse): boolean => {
    if (!isEditableByRespTech(row.designation)) return false;
    if (row.id != null && row.id < 0) return false; // computed row
    return canUpdate;
  };

  // Same merge / dedupe / order as Excel & PDF export (resumeCoutsHebdoDisplay.buildDisplayRows).
  const displayRows = useMemo(
    () => buildDisplayRows(rows, computedRows, semaine, farmId, lot),
    [rows, computedRows, semaine, farmId, lot]
  );

  const totalCumul = useMemo(() => {
    return displayRows.reduce(
      (sum, r) => sum + (getEffectiveCumul(r) ?? 0),
      0
    );
  }, [displayRows]);

  const totalS1 = useMemo(() => {
    return displayRows.reduce(
      (sum, r) => sum + (toNum(r.valeurS1) ?? 0),
      0
    );
  }, [displayRows]);

  const totalCumulDhKg = useMemo(() => {
    if (poidsVifProduitKg == null || !Number.isFinite(poidsVifProduitKg) || poidsVifProduitKg <= 0)
      return null;
    return totalCumul / poidsVifProduitKg;
  }, [totalCumul, poidsVifProduitKg]);

  const startEdit = (row: SuiviCoutHebdoResponse) => {
    if (!canEditRow(row)) return;
    setEditingId(row.id);
    const v1 = toOptionalNumber(row.valeurS1);
    const cu = toOptionalNumber(row.cumul);
    setEditValeurS1(v1 != null ? v1.toFixed(2) : "");
    setEditCumul(cu != null ? cu.toFixed(2) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValeurS1("");
    setEditCumul("");
  };

  const saveEdit = async (row: SuiviCoutHebdoResponse) => {
    if (!canEditRow(row)) return;
    setSaving(true);
    try {
      const valeurS1 = editValeurS1.trim() === "" ? null : toOptionalNumber(editValeurS1);
      const cumul = editCumul.trim() === "" ? null : toOptionalNumber(editCumul);
      await api.suiviCoutHebdo.save(
        {
          designation: row.designation,
          valeurS1,
          cumul,
        },
        { farmId, lot, semaine }
      );
      cancelEdit();
      onSaveSuccess?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm" id="couts">
      <div className="px-5 py-4 border-b border-border bg-sky-100 dark:bg-sky-950/40">
        <h3 className="text-base font-display font-bold text-primary text-center">
          PRIX DE REVIENT
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="table-farm w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-sky-100 dark:bg-sky-950/40">
              <th className="px-4 py-2.5 text-left font-semibold text-foreground border-r border-border min-w-[180px]">
                DESIGNATION
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-r border-border min-w-[112px] !text-center">
                {semaine}
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-r border-border min-w-[112px] !text-center">
                CUMUL
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground border-r border-border whitespace-nowrap min-w-[112px] !text-center">
                CUMUL DH/KG
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-foreground min-w-[88px] !text-center">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => {
              const effectiveCumul = getEffectiveCumul(row);
              const cumulDhKg =
                poidsVifProduitKg != null &&
                Number.isFinite(poidsVifProduitKg) &&
                poidsVifProduitKg > 0 &&
                effectiveCumul != null
                  ? effectiveCumul / poidsVifProduitKg
                  : null;
              const pct =
                totalCumul > 0 && effectiveCumul != null ? (effectiveCumul / totalCumul) * 100 : null;
              const isEditing = editingId === row.id;

              return (
                <tr
                  key={row.id || `placeholder-${row.designation}`}
                  className={`border-b border-border ${index % 2 === 0 ? "bg-card" : "bg-muted/10"}`}
                >
                  <td className="px-4 py-2 border-r border-border font-medium text-foreground">
                    {row.designation}
                  </td>
                  <td className="px-3 py-2 border-r border-border text-center align-middle whitespace-nowrap">
                    {isEditableByRespTech(row.designation) ? (
                      isEditing ? (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-[7.5rem] min-w-[6rem] rounded border border-input bg-background px-2 py-1 text-center text-sm tabular-nums"
                            value={editValeurS1}
                            onChange={(e) => setEditValeurS1(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(row)}
                            disabled={saving}
                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : canEditRow(row) ? (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded border border-border bg-muted/30 px-2 py-1 text-sm tabular-nums hover:bg-muted/50 whitespace-nowrap"
                        >
                          {formatResumeAmount(row.valeurS1)}
                        </button>
                      ) : (
                        <span className="tabular-nums text-foreground whitespace-nowrap">
                          {formatResumeAmount(row.valeurS1)}
                        </span>
                      )
                    ) : (
                      <span className="tabular-nums text-foreground whitespace-nowrap">
                        {formatResumeAmount(row.valeurS1)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-r border-border text-center align-middle whitespace-nowrap">
                    {isEditableByRespTech(row.designation) && isEditing ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-[7.5rem] min-w-[6rem] rounded border border-input bg-background px-2 py-1 text-center text-sm tabular-nums"
                        value={editCumul}
                        onChange={(e) => setEditCumul(e.target.value)}
                      />
                    ) : (
                      <span className="tabular-nums text-foreground whitespace-nowrap">
                        {formatResumeAmount(effectiveCumul)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-r border-border text-center tabular-nums text-foreground whitespace-nowrap">
                    {formatResumeAmount(cumulDhKg)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-foreground whitespace-nowrap">
                    {formatPct(pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-sky-100 dark:bg-sky-950/40 font-semibold text-foreground">
              <td className="px-4 py-2.5 border-r border-border">Total</td>
              <td className="px-3 py-2.5 border-r border-border text-center tabular-nums whitespace-nowrap">
                {formatResumeAmount(totalS1)}
              </td>
              <td className="px-3 py-2.5 border-r border-border text-center tabular-nums whitespace-nowrap">
                {formatResumeAmount(totalCumul)}
              </td>
              <td className="px-3 py-2.5 border-r border-border text-center tabular-nums whitespace-nowrap">
                {formatResumeAmount(totalCumulDhKg)}
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums whitespace-nowrap">
                {totalCumul > 0 ? formatPct(100) : formatPct(null)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Table PRIX DE REVIENT/SUJET et PRIX DE REVIENT/KG — below Prix de revient */}
      {(effectifRestantFinSemaine != null || totalNbreProduction != null) && (
        <div className="mt-4 overflow-x-auto">
          <table className="table-farm w-full min-w-[320px] text-sm border-t border-border">
            <thead>
              <tr className="bg-muted/80 border-b border-border">
                <th className="px-4 py-2.5 text-left font-semibold text-foreground min-w-[200px]">
                  INDICATEUR
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-foreground border-l border-border min-w-[128px] !text-center">
                  VALEUR
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-card">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  PRIX DE REVIENT/SUJET
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20 whitespace-nowrap">
                  {formatResumeAmount(
                    prixRevientParSujet != null
                      ? prixRevientParSujet
                      : totalCumul > 0 &&
                          effectifRestantFinSemaine != null &&
                          totalNbreProduction != null &&
                          effectifRestantFinSemaine + totalNbreProduction > 0
                        ? totalCumul / (effectifRestantFinSemaine + totalNbreProduction)
                        : null
                  )}
                </td>
              </tr>
              <tr className="border-b border-border bg-muted/10">
                <td className="px-4 py-2.5 border-r border-border font-medium text-foreground">
                  PRIX DE REVIENT/KG
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground border-l border-border bg-muted/20 whitespace-nowrap">
                  {formatResumeAmount(
                    prixRevientParKg != null
                      ? prixRevientParKg
                      : totalCumulDhKg
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
