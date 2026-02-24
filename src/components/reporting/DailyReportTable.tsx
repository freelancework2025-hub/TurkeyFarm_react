import { useState, useEffect, useCallback } from "react";
import { Plus, Save, CheckCircle, Trash2, Loader2 } from "lucide-react";
import { api, type DailyReportResponse, type DailyReportRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BUILDINGS = ["Bâtiment 01", "Bâtiment 02", "Bâtiment 03", "Bâtiment 04"];
const DESIGNATIONS = ["Mâle", "Femelle"];

interface DailyRow {
  id: string;
  report_date: string;
  age_jour: string;
  semaine: string;
  building: string;
  designation: string;
  nbr: string;
  water_l: string;
  temp_min: string;
  temp_max: string;
  traitement: string;
  verified: boolean;
}

function toRow(r: DailyReportResponse): DailyRow {
  return {
    id: String(r.id),
    report_date: r.reportDate,
    age_jour: r.ageJour != null ? String(r.ageJour) : "",
    semaine: r.semaine != null ? String(r.semaine) : "",
    building: r.building,
    designation: r.designation,
    nbr: String(r.nbr),
    water_l: r.waterL != null ? String(r.waterL) : "",
    temp_min: r.tempMin != null ? String(r.tempMin) : "",
    temp_max: r.tempMax != null ? String(r.tempMax) : "",
    traitement: r.traitement ?? "",
    verified: r.verified,
  };
}

function emptyRow(today: string): DailyRow {
  return {
    id: crypto.randomUUID(),
    report_date: today,
    age_jour: "",
    semaine: "",
    building: BUILDINGS[0],
    designation: DESIGNATIONS[0],
    nbr: "",
    water_l: "",
    temp_min: "",
    temp_max: "",
    traitement: "",
    verified: false,
  };
}

/** Row id from API is numeric; new rows use UUID. */
function isSavedRow(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Add n days to ISO date string (YYYY-MM-DD), return YYYY-MM-DD. */
function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/** Age (days) starts at 1 on placement date; semaine = week number (S1=1–7, S2=8–14, …). Per lot, age resets to 1. */
function computeAgeAndSemaine(reportDate: string, placementDate: string): { age: number; semaine: number } {
  const report = new Date(reportDate + "T12:00:00");
  const placement = new Date(placementDate + "T12:00:00");
  const diffTime = report.getTime() - placement.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const age = Math.max(1, diffDays + 1);
  const semaine = Math.ceil(age / 7);
  return { age, semaine };
}

interface DailyReportTableProps {
  /** When set, only load and show reports for this date (YYYY-MM-DD). New row uses this date. */
  initialDate?: string;
  /** When set (Admin/RT), list and create are scoped to this farm. */
  farmId?: number | null;
  /** When set (e.g. from Reporting Journalier lot selector), age/semaine are computed from placement date for this lot. */
  lot?: string | null;
  /** When true, show "Nouveau tableau vide pour le [date]" (opened via Nouveau rapport). */
  isNewReport?: boolean;
  /** When provided and save succeeds while isNewReport: called with saved report date so parent can stay on that day (set selectedDate + setIsNewReport false). */
  onSaveSuccess?: (reportDate: string) => void;
}

export default function DailyReportTable({ initialDate, farmId, lot, isNewReport, onSaveSuccess }: DailyReportTableProps) {
  const today = new Date().toISOString().split("T")[0];
  const { selectedFarmName, allFarmsMode, canCreate, canUpdate, canDelete, isReadOnly } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<DailyRow[]>([emptyRow(initialDate ?? today)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [placementDateForLot, setPlacementDateForLot] = useState<string | null>(null);
  /** When isNewReport: date for the new report (last saved date + 1 day). Used for subtitle and addRow. */
  const [computedNewReportDate, setComputedNewReportDate] = useState<string | null>(null);
  const dateContext = (isNewReport && computedNewReportDate) ? computedNewReportDate : (initialDate ?? today);

  useEffect(() => {
    if (!farmId || !lot || lot.trim() === "") {
      setPlacementDateForLot(null);
      return;
    }
    api.placements.list(farmId).then((list) => {
      const forLot = list.filter((p) => p.lot === lot.trim());
      if (forLot.length === 0) {
        setPlacementDateForLot(null);
        return;
      }
      const minDate = forLot.reduce((min, p) => (p.placementDate < min ? p.placementDate : min), forLot[0].placementDate);
      setPlacementDateForLot(minDate);
    }).catch(() => setPlacementDateForLot(null));
  }, [farmId, lot]);

  const load = useCallback(async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split("T")[0];
    let forDate = initialDate ?? todayStr;
    try {
      const list = await api.dailyReports.list(farmId ?? undefined);
      // For "Nouveau rapport": use next day after last saved report so Date and Âge (J) increment +1
      if (isNewReport && list.length > 0) {
        const maxReportDate = list.reduce((max, r) => (r.reportDate > max ? r.reportDate : max), list[0].reportDate);
        forDate = addDays(maxReportDate, 1);
        setComputedNewReportDate(forDate);
      } else if (isNewReport) {
        setComputedNewReportDate(forDate);
      } else {
        setComputedNewReportDate(null);
      }
      const filtered = initialDate && !isNewReport ? list.filter((r) => r.reportDate === initialDate) : list;
      let mapped = filtered.map(toRow);
      if (placementDateForLot) {
        mapped = mapped.map((r) => {
          const { age, semaine } = computeAgeAndSemaine(r.report_date, placementDateForLot);
          return { ...r, age_jour: String(age), semaine: String(semaine) };
        });
      }
      let empty = emptyRow(forDate);
      if (placementDateForLot) {
        const { age, semaine } = computeAgeAndSemaine(empty.report_date, placementDateForLot);
        empty = { ...empty, age_jour: String(age), semaine: String(semaine) };
      }
      // When "Nouveau rapport": always show empty table for the new day (ignore existing data for that date)
      if (isNewReport) {
        setRows([empty]);
      } else {
        // Backoffice (read-only): show only saved rows, no empty row to add
        setRows(isReadOnly ? mapped : (mapped.length ? [...mapped, empty] : [empty]));
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les rapports.",
        variant: "destructive",
      });
      setRows([emptyRow(forDate)]);
    } finally {
      setLoading(false);
    }
  }, [toast, initialDate, farmId, isReadOnly, placementDateForLot, isNewReport]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = () => {
    const last = rows[rows.length - 1];
    const newRow: DailyRow = {
      ...emptyRow(dateContext),
      id: crypto.randomUUID(),
      report_date: last?.report_date || dateContext,
      age_jour: last?.age_jour ?? "",
      semaine: last?.semaine ?? "",
    };
    if (placementDateForLot && newRow.report_date) {
      const { age, semaine } = computeAgeAndSemaine(newRow.report_date, placementDateForLot);
      newRow.age_jour = String(age);
      newRow.semaine = String(semaine);
    }
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof DailyRow, value: string | boolean) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, [field]: value } : r));
      if (field === "report_date" && placementDateForLot && typeof value === "string") {
        const row = next.find((r) => r.id === id);
        if (row && row.report_date) {
          const { age, semaine } = computeAgeAndSemaine(row.report_date, placementDateForLot);
          return next.map((r) =>
            r.id === id ? { ...r, age_jour: String(age), semaine: String(semaine) } : r
          );
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!canCreate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas créer de données.", variant: "destructive" });
      return;
    }
    const toSend: DailyReportRequest[] = rows
      .filter(
        (r) =>
          r.report_date &&
          r.building &&
          r.designation &&
          (r.nbr.trim() !== "" || r.nbr === "0")
      )
      .map((r) => ({
        reportDate: r.report_date,
        ageJour: r.age_jour.trim() !== "" ? parseInt(r.age_jour, 10) : null,
        semaine: r.semaine.trim() !== "" ? parseInt(r.semaine, 10) : null,
        building: r.building,
        designation: r.designation,
        nbr: parseInt(r.nbr, 10) || 0,
        waterL: r.water_l.trim() !== "" ? parseFloat(r.water_l) : null,
        tempMin: r.temp_min.trim() !== "" ? parseFloat(r.temp_min) : null,
        tempMax: r.temp_max.trim() !== "" ? parseFloat(r.temp_max) : null,
        traitement: r.traitement.trim() || null,
        verified: r.verified,
      }));
    if (toSend.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Renseignez au moins date, bâtiment, désignation et NBR.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const reportDate = toSend[0].reportDate;
      await api.dailyReports.replaceBatch(reportDate, toSend, farmId ?? undefined);
      toast({ title: "Rapports enregistrés", description: `${toSend.length} ligne(s) enregistrée(s).` });
      if (isNewReport && onSaveSuccess) {
        onSaveSuccess(reportDate);
      } else {
        await load();
      }
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

  const totalMortality = rows.reduce((s, r) => s + (parseInt(r.nbr) || 0), 0);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des rapports journaliers…</span>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex flex-col gap-2 px-5 py-4 border-b border-border">
        {isNewReport && dateContext && (
          <p className="text-sm font-medium text-primary">
            Nouveau tableau vide pour le {dateContext.split("-").reverse().join("/")}
          </p>
        )}
        <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">
            Reporting Journalier
          </h2>
          <p className="text-xs text-muted-foreground">
            {initialDate
              ? `Rapport du ${initialDate.split("-").reverse().join("/")}`
              : allFarmsMode
                ? "Suivi quotidien : mortalité, eau, température, traitements (toutes fermes)."
                : selectedFarmName
                  ? `Ferme : ${selectedFarmName} — Suivi quotidien`
                  : "Suivi quotidien : mortalité, consommation d'eau, température, traitements"}
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Ligne
            </button>
            <button
              onClick={handleSave}
              disabled={!canCreate || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-farm">
          <thead>
            <tr>
              <th>Date</th>
              <th>Âge (J)</th>
              <th>Semaine</th>
              <th>Bâtiment</th>
              <th>Désignation</th>
              <th>NBR (Mortalité)</th>
              <th>Conso. Eau (L)</th>
              <th>Temp. Min</th>
              <th>Temp. Max</th>
              <th>Traitement</th>
              <th>Vérifié</th>
              {!isReadOnly && canDelete ? <th className="w-10"></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const saved = isSavedRow(row.id);
              const readOnly = isReadOnly || (saved && !canUpdate);
              return (
                <tr key={row.id}>
                  <td>
                    <input
                      type="date"
                      value={row.report_date}
                      onChange={(e) => updateRow(row.id, "report_date", e.target.value)}
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.age_jour}
                      onChange={(e) => updateRow(row.id, "age_jour", e.target.value)}
                      placeholder="0"
                      min="0"
                      readOnly={readOnly || !!placementDateForLot}
                      className={(readOnly || placementDateForLot) ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.semaine}
                      onChange={(e) => updateRow(row.id, "semaine", e.target.value)}
                      placeholder="0"
                      min="0"
                      readOnly={readOnly || !!placementDateForLot}
                      className={(readOnly || placementDateForLot) ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <select
                      value={row.building}
                      onChange={(e) => updateRow(row.id, "building", e.target.value)}
                      className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                      disabled={readOnly}
                    >
                      {BUILDINGS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.designation}
                      onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                      className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                      disabled={readOnly}
                    >
                      {DESIGNATIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.nbr}
                      onChange={(e) => updateRow(row.id, "nbr", e.target.value)}
                      placeholder="0"
                      min="0"
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.water_l}
                      onChange={(e) => updateRow(row.id, "water_l", e.target.value)}
                      placeholder="0.0"
                      step="0.1"
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.temp_min}
                      onChange={(e) => updateRow(row.id, "temp_min", e.target.value)}
                      placeholder="°C"
                      step="0.1"
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.temp_max}
                      onChange={(e) => updateRow(row.id, "temp_max", e.target.value)}
                      placeholder="°C"
                      step="0.1"
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.traitement}
                      onChange={(e) => updateRow(row.id, "traitement", e.target.value)}
                      placeholder="—"
                      className={`min-w-[120px] ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => updateRow(row.id, "verified", !row.verified)}
                      disabled={readOnly}
                      className={`p-1 rounded transition-colors ${
                        row.verified
                          ? "text-farm-green"
                          : "text-muted-foreground hover:text-accent"
                      } ${readOnly ? "cursor-not-allowed opacity-60" : ""}`}
                      title={row.verified ? "Vérifié" : "Marquer comme vérifié"}
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  </td>
                  {!isReadOnly && canDelete ? (
                    <td>
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        disabled={rows.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60">
              <td colSpan={5} className="text-right font-semibold text-sm px-3 py-2">
                Total Mortalité du jour :
              </td>
              <td className="px-3 py-2 font-bold text-sm text-destructive">
                {totalMortality}
              </td>
              <td colSpan={!isReadOnly && canDelete ? 6 : 5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
