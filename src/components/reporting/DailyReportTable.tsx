import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Save, CheckCircle, Trash2, Loader2, Info } from "lucide-react";
import { api, type DailyReportResponse, type DailyReportRequest, type SetupInfoResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BUILDINGS_FALLBACK = ["Bâtiment 01", "Bâtiment 02", "Bâtiment 03", "Bâtiment 04"];
const DESIGNATIONS_FALLBACK = ["Mâle", "Femelle"];

interface BuildingSexConfig {
  building: string;
  sex: string;
}

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
    building: BUILDINGS_FALLBACK[0],
    designation: DESIGNATIONS_FALLBACK[0],
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
  const { selectedFarmName, allFarmsMode, canCreate, canUpdate, canDelete, isReadOnly, isResponsableFerme } = useAuth();
  /** Only Admin/RT (canUpdate) can edit age/semaine on saved rows. RESPONSABLE_FERME cannot modify after save. */
  const canEditAgeSemaine = canUpdate;
  const { toast } = useToast();
  const [rows, setRows] = useState<DailyRow[]>([emptyRow(initialDate ?? today)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [placementDateForLot, setPlacementDateForLot] = useState<string | null>(null);
  /** When true, next load() shows all reports (no initialDate filter). Used after saving a batch with multiple dates. */
  const showAllOnNextLoadRef = useRef(false);
  /** When isNewReport: date for the new report (last saved date + 1 day). Used for subtitle and addRow. */
  const [computedNewReportDate, setComputedNewReportDate] = useState<string | null>(null);
  const dateContext = (isNewReport && computedNewReportDate) ? computedNewReportDate : (initialDate ?? today);
  
  /** Building+Sex configurations from setup info */
  const [setupConfigs, setSetupConfigs] = useState<BuildingSexConfig[]>([]);
  const [setupLoading, setSetupLoading] = useState(true);
  
  /** Get available buildings from setup configs or fallback */
  const availableBuildings = setupConfigs.length > 0 
    ? [...new Set(setupConfigs.map(c => c.building))]
    : BUILDINGS_FALLBACK;
  
  /** Get available designations from setup configs or fallback */
  const availableDesignations = setupConfigs.length > 0
    ? [...new Set(setupConfigs.map(c => c.sex))]
    : DESIGNATIONS_FALLBACK;

  /** Load setup info to get building+sex configurations */
  useEffect(() => {
    if (!lot || lot.trim() === "") {
      setSetupConfigs([]);
      setSetupLoading(false);
      return;
    }
    setSetupLoading(true);
    api.setupInfo.list(farmId ?? undefined, lot.trim())
      .then((list: SetupInfoResponse[]) => {
        const configs: BuildingSexConfig[] = list.map(s => ({
          building: s.building,
          sex: s.sex,
        }));
        setSetupConfigs(configs);
        
        // Also get placement date from setup info
        if (list.length > 0) {
          const minDate = list.reduce((min, s) => 
            (s.dateMiseEnPlace < min ? s.dateMiseEnPlace : min), 
            list[0].dateMiseEnPlace
          );
          setPlacementDateForLot(minDate);
        }
      })
      .catch(() => {
        setSetupConfigs([]);
      })
      .finally(() => setSetupLoading(false));
  }, [farmId, lot]);

  /** Fallback: if no setup info, try to get placement date from placements API */
  useEffect(() => {
    if (setupConfigs.length > 0 || !farmId || !lot || lot.trim() === "") {
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
  }, [farmId, lot, setupConfigs.length]);

  /** Create empty rows for all building+sex configurations from setup info */
  const createEmptyRowsFromSetup = useCallback((forDate: string): DailyRow[] => {
    if (setupConfigs.length === 0) {
      // Fallback: create single empty row
      let empty = emptyRow(forDate);
      if (placementDateForLot) {
        const { age, semaine } = computeAgeAndSemaine(empty.report_date, placementDateForLot);
        empty = { ...empty, age_jour: String(age), semaine: String(semaine) };
      }
      return [empty];
    }
    
    // Create one row per building+sex configuration
    return setupConfigs.map(config => {
      let row: DailyRow = {
        id: crypto.randomUUID(),
        report_date: forDate,
        age_jour: "",
        semaine: "",
        building: config.building,
        designation: config.sex,
        nbr: "",
        water_l: "",
        temp_min: "",
        temp_max: "",
        traitement: "",
        verified: false,
      };
      if (placementDateForLot) {
        const { age, semaine } = computeAgeAndSemaine(row.report_date, placementDateForLot);
        row = { ...row, age_jour: String(age), semaine: String(semaine) };
      }
      return row;
    });
  }, [setupConfigs, placementDateForLot]);

  const load = useCallback(async () => {
    console.log("🔄 DailyReportTable - Loading with:", { farmId, lot, initialDate, isNewReport });
    setLoading(true);
    const todayStr = new Date().toISOString().split("T")[0];
    let forDate = initialDate ?? todayStr;
    try {
      const list = await api.dailyReports.list(farmId ?? undefined, lot ?? undefined);
      console.log("✅ DailyReportTable - Daily reports loaded:", { count: list.length, list });
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
      // When we just saved a batch with multiple dates, show all rows (no filter)
      const skipDateFilter = showAllOnNextLoadRef.current;
      if (skipDateFilter) showAllOnNextLoadRef.current = false;
      const filtered = (initialDate && !isNewReport && !skipDateFilter)
        ? list.filter((r) => r.reportDate === initialDate)
        : list;
      console.log("📋 DailyReportTable - Filtered reports:", { count: filtered.length, filtered });
      let mapped = filtered.map(toRow);
      if (placementDateForLot) {
        mapped = mapped.map((r) => {
          const { age, semaine } = computeAgeAndSemaine(r.report_date, placementDateForLot);
          return { ...r, age_jour: String(age), semaine: String(semaine) };
        });
      }
      
      // When "Nouveau rapport" (and not refreshing after multi-date save): create rows from setup configs
      if (isNewReport && !skipDateFilter) {
        const emptyRows = createEmptyRowsFromSetup(forDate);
        setRows(emptyRows);
      } else {
        // Backoffice (read-only): show only saved rows, no empty row to add
        if (isReadOnly) {
          setRows(mapped);
        } else if (mapped.length > 0) {
          // Add empty rows from setup for data entry
          const emptyRows = createEmptyRowsFromSetup(forDate);
          setRows([...mapped, ...emptyRows]);
        } else {
          // No existing data: create rows from setup configs
          const emptyRows = createEmptyRowsFromSetup(forDate);
          setRows(emptyRows);
        }
      }
    } catch (error) {
      console.error("❌ DailyReportTable - Error loading daily reports:", error);
      const emptyRows = createEmptyRowsFromSetup(forDate);
      setRows(emptyRows);
    } finally {
      setLoading(false);
    }
  }, [initialDate, farmId, lot, isReadOnly, placementDateForLot, isNewReport, createEmptyRowsFromSetup]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = () => {
    const last = rows[rows.length - 1];
    const reportDate = last?.report_date || dateContext;
    
    // If we have setup configs, add rows for all building+sex combinations
    if (setupConfigs.length > 0) {
      const newRows: DailyRow[] = setupConfigs.map(config => {
        let newRow: DailyRow = {
          id: crypto.randomUUID(),
          report_date: reportDate,
          age_jour: "",
          semaine: "",
          building: config.building,
          designation: config.sex,
          nbr: "",
          water_l: "",
          temp_min: "",
          temp_max: "",
          traitement: "",
          verified: false,
        };
        if (placementDateForLot && newRow.report_date) {
          const { age, semaine } = computeAgeAndSemaine(newRow.report_date, placementDateForLot);
          newRow.age_jour = String(age);
          newRow.semaine = String(semaine);
        }
        return newRow;
      });
      setRows((prev) => [...prev, ...newRows]);
    } else {
      // Fallback: add single row
      const newRow: DailyRow = {
        ...emptyRow(dateContext),
        id: crypto.randomUUID(),
        report_date: reportDate,
        age_jour: last?.age_jour ?? "",
        semaine: last?.semaine ?? "",
      };
      if (placementDateForLot && newRow.report_date) {
        const { age, semaine } = computeAgeAndSemaine(newRow.report_date, placementDateForLot);
        newRow.age_jour = String(age);
        newRow.semaine = String(semaine);
      }
      setRows((prev) => [...prev, newRow]);
    }
  };

  const removeRow = async (id: string) => {
    if (rows.length <= 1) return;
    if (isSavedRow(id) && canDelete) {
      try {
        await api.dailyReports.delete(parseInt(id, 10));
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast({ title: "Ligne supprimée", description: "Le rapport a été supprimé de la base de données." });
      } catch {
        toast({ title: "Erreur", description: "Impossible de supprimer le rapport.", variant: "destructive" });
      }
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
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

  const toRequest = (r: DailyRow): DailyReportRequest => ({
    reportDate: r.report_date,
    ageJour: r.age_jour.trim() !== "" ? parseInt(r.age_jour, 10) : null,
    semaine: r.semaine.trim() !== "" ? parseInt(r.semaine, 10) : null,
    lot: lot?.trim() || null,
    building: r.building,
    designation: r.designation,
    nbr: parseInt(r.nbr, 10) || 0,
    waterL: r.water_l.trim() !== "" ? parseFloat(r.water_l) : null,
    tempMin: r.temp_min.trim() !== "" ? parseFloat(r.temp_min) : null,
    tempMax: r.temp_max.trim() !== "" ? parseFloat(r.temp_max) : null,
    traitement: r.traitement.trim() || null,
    verified: r.verified,
  });

  const handleSave = async () => {
    if (!canCreate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas créer de données.", variant: "destructive" });
      return;
    }
    const validRows = rows.filter(
      (r) =>
        r.report_date &&
        r.building &&
        r.designation &&
        (r.nbr.trim() !== "" || r.nbr === "0")
    );
    if (validRows.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Renseignez au moins date, bâtiment, désignation et NBR.",
        variant: "destructive",
      });
      return;
    }

    const savedRows = validRows.filter((r) => isSavedRow(r.id));
    const newRows = validRows.filter((r) => !isSavedRow(r.id));
    const toSend = validRows.map(toRequest);
    const reportDate = toSend[0].reportDate;
    const distinctDates = new Set(toSend.map((r) => r.reportDate));
    const hasMultipleDates = distinctDates.size > 1;

    setSaving(true);
    try {
      if (canUpdate && (savedRows.length > 0 || newRows.length > 0)) {
        // Admin/RT: update existing rows (persists age/semaine edits), create new rows
        await Promise.all(savedRows.map((r) => api.dailyReports.update(parseInt(r.id, 10), toRequest(r))));
        if (newRows.length > 0) {
          await api.dailyReports.createBatch(newRows.map(toRequest), farmId ?? undefined);
        }
      } else {
        // RESPONSABLE_FERME: replace batch per date (delete+create for each date)
        const byDate = new Map<string, DailyReportRequest[]>();
        for (const r of toSend) {
          const list = byDate.get(r.reportDate) ?? [];
          list.push(r);
          byDate.set(r.reportDate, list);
        }
        for (const [date, rowsForDate] of byDate) {
          await api.dailyReports.replaceBatch(date, rowsForDate, farmId ?? undefined);
        }
      }

      toast({ title: "Rapports enregistrés", description: `${toSend.length} ligne(s) enregistrée(s).` });

      if (hasMultipleDates) {
        showAllOnNextLoadRef.current = true;
        await load();
      } else if (isNewReport && onSaveSuccess) {
        onSaveSuccess(reportDate);
      } else {
        await load();
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible d'enregistrer les rapports.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalMortality = rows.reduce((s, r) => s + (parseInt(r.nbr) || 0), 0);

  if (loading || setupLoading) {
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
              <th>AGE</th>
              <th>Date</th>
              <th>SEM</th>
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
              // RESPONSABLE_FERME can only delete unsaved rows; other roles can delete based on canDelete permission
              const canDeleteThisRow = canDelete && !(isResponsableFerme && saved);
              return (
                <tr key={row.id}>
                  <td className="text-sm font-medium text-muted-foreground">
                    {row.age_jour || "—"}
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.report_date}
                      onChange={(e) => updateRow(row.id, "report_date", e.target.value)}
                      disabled={readOnly}
                      className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                    />
                  </td>
                  <td className="text-sm font-medium text-muted-foreground">
                    {row.semaine?.trim() ? (row.semaine.match(/^\d+$/) ? `S${row.semaine}` : row.semaine) : "—"}
                  </td>
                  <td>
                    {setupConfigs.length > 0 ? (
                      <span className="text-sm font-medium">{row.building}</span>
                    ) : (
                      <select
                        value={row.building}
                        onChange={(e) => updateRow(row.id, "building", e.target.value)}
                        className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                        disabled={readOnly}
                      >
                        {availableBuildings.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {setupConfigs.length > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.designation === "Mâle" 
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" 
                          : "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                      }`}>
                        {row.designation}
                      </span>
                    ) : (
                      <select
                        value={row.designation}
                        onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                        className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                        disabled={readOnly}
                      >
                        {availableDesignations.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    )}
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
                  {!isReadOnly && canDeleteThisRow ? (
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
