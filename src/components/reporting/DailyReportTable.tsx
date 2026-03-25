import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Check, Trash2, Loader2, Info } from "lucide-react";
import { api, type DailyReportResponse, type DailyReportRequest, type SetupInfoResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

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

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function normalizeDecFromApi(v: unknown): string {
  if (v == null) return "";
  const n = typeof v === "number" ? v : toOptionalNumber(String(v));
  return n != null ? n.toFixed(2) : String(v);
}

function formatIntDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 0) : "—";
}

function formatDecDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

type NumericFieldDaily = "nbr" | "water_l" | "temp_min" | "temp_max";

function dailyNumericFocusKey(rowId: string, field: NumericFieldDaily): string {
  return `${rowId}:${field}`;
}

function toRow(r: DailyReportResponse): DailyRow {
  return {
    id: String(r.id),
    report_date: r.reportDate,
    age_jour: r.ageJour != null ? String(r.ageJour) : "",
    semaine: r.semaine != null ? String(r.semaine) : "",
    building: r.building,
    designation: r.designation,
    nbr: r.nbr != null ? String(r.nbr) : "",
    water_l: normalizeDecFromApi(r.waterL),
    temp_min: normalizeDecFromApi(r.tempMin),
    temp_max: normalizeDecFromApi(r.tempMax),
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

/** Draft rows for given effectif configs (same order as Effectif Mis en Place subset). */
function createRowsForConfigs(
  configs: BuildingSexConfig[],
  forDate: string,
  placement: string | null | undefined
): DailyRow[] {
  if (configs.length === 0) return [];
  return configs.map((config) => {
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
    if (placement) {
      const { age, semaine } = computeAgeAndSemaine(row.report_date, placement);
      row = { ...row, age_jour: String(age), semaine: String(semaine) };
    }
    return row;
  });
}

/** Row id from API is numeric; new rows use UUID. */
function isSavedRow(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Match Reporting Journalier row order to Effectif Mis en Place (same setup list order). */
function effectifConfigIndex(configs: BuildingSexConfig[], building: string, designation: string): number {
  const i = configs.findIndex((c) => c.building === building && c.sex === designation);
  return i === -1 ? 10_000 : i;
}

function sortRowsByEffectifOrder(rows: DailyRow[], configs: BuildingSexConfig[]): DailyRow[] {
  if (configs.length === 0) return rows;
  return [...rows].sort((a, b) => {
    const byDate = a.report_date.localeCompare(b.report_date);
    if (byDate !== 0) return byDate;
    const ia = effectifConfigIndex(configs, a.building, a.designation);
    const ib = effectifConfigIndex(configs, b.building, b.designation);
    if (ia !== ib) return ia - ib;
    const sa = isSavedRow(a.id);
    const sb = isSavedRow(b.id);
    if (sa !== sb) return sa ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Per report date: keep saved lines and add empty draft lines for missing bâtiment/sexe (same as Effectif).
 * When `padDateIfEmpty` is set and there are no rows yet, show a full effectif template for that date.
 */
function mergeEffectifDraftsForDates(
  mapped: DailyRow[],
  setupConfigs: BuildingSexConfig[],
  effectivePlacement: string | null | undefined,
  padDateIfEmpty?: string | null
): DailyRow[] {
  if (setupConfigs.length === 0) return mapped;
  const byDate = new Map<string, DailyRow[]>();
  for (const r of mapped) {
    const d = r.report_date;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(r);
  }
  if (byDate.size === 0 && padDateIfEmpty) {
    return sortRowsByEffectifOrder(
      createRowsForConfigs(setupConfigs, padDateIfEmpty, effectivePlacement),
      setupConfigs
    );
  }
  if (byDate.size === 0) return mapped;
  const out: DailyRow[] = [];
  for (const d of Array.from(byDate.keys()).sort()) {
    const saved = byDate.get(d)!;
    const have = new Set(saved.map((r) => `${r.building}|${r.designation}`));
    const missing = setupConfigs.filter((c) => !have.has(`${c.building}|${c.sex}`));
    out.push(...saved, ...createRowsForConfigs(missing, d, effectivePlacement));
  }
  return sortRowsByEffectifOrder(out, setupConfigs);
}

/** Min date mise en place from setup rows, or placements API for the lot (so age/semaine are ready before first daily load). */
async function resolvePlacementDateForLot(
  setupList: SetupInfoResponse[],
  farmId: number | null | undefined,
  lotTrimmed: string
): Promise<string | null> {
  const datesWithPlacement = setupList.filter((s) => s.dateMiseEnPlace);
  if (datesWithPlacement.length > 0) {
    return datesWithPlacement.reduce(
      (min, s) => (s.dateMiseEnPlace! < min ? s.dateMiseEnPlace! : min),
      datesWithPlacement[0]!.dateMiseEnPlace!
    );
  }
  if (farmId == null) return null;
  try {
    const placements = await api.placements.list(farmId);
    const forLot = placements.filter((p) => p.lot === lotTrimmed);
    if (forLot.length === 0) return null;
    return forLot.reduce((min, p) => (p.placementDate < min ? p.placementDate : min), forLot[0].placementDate);
  } catch {
    return null;
  }
}

/** Add n days to ISO date string (YYYY-MM-DD), return YYYY-MM-DD. */
function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/** Age (days) starts at 1 on placement date; semaine = week number (S1=1–7, S2=8–14, …). Per lot, age resets to 1. */
function computeAgeAndSemaine(reportDate: string, placementDate: string): { age: number; semaine: number } {
  // Use UTC dates to avoid DST issues
  const report = new Date(reportDate);
  const placement = new Date(placementDate);
  
  // Set to start of day (midnight) in UTC to ensure consistent calculation
  report.setUTCHours(0, 0, 0, 0);
  placement.setUTCHours(0, 0, 0, 0);
  
  const diffTime = report.getTime() - placement.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); // Use Math.round to handle DST
  const age = Math.max(1, diffDays + 1);
  const semaine = Math.ceil(age / 7);
  
  console.log("🔢 computeAgeAndSemaine:", {
    reportDate,
    placementDate,
    reportTime: report.getTime(),
    placementTime: placement.getTime(),
    diffTime,
    diffDays,
    age,
    semaine
  });
  return { age, semaine };
}

function isRowValidForSave(r: DailyRow): boolean {
  return Boolean(
    r.report_date &&
    r.building &&
    r.designation &&
    (r.nbr.trim() !== "" || r.nbr === "0")
  );
}

type ToastFn = (o: { title: string; description?: string; variant?: "destructive" }) => void;

function verifyNoDuplicateCombos(validRows: DailyRow[], toast: ToastFn): boolean {
  const combos = new Set<string>();
  for (const row of validRows) {
    const combo = `${row.report_date}|${row.building}|${row.designation}`;
    if (combos.has(combo)) {
      toast({
        title: "Données en double",
        description:
          "Plusieurs lignes ont la même date, bâtiment et désignation. Chaque jour doit avoir un âge unique.",
        variant: "destructive",
      });
      return false;
    }
    combos.add(combo);
  }
  return true;
}

/** Returns false if an age appears on multiple dates in the same week (toast shown). */
async function checkAgeWeekConsistency(
  rowsWithCalculatedAge: DailyRow[],
  updatingIds: Set<number>,
  farmId: number | null | undefined,
  lot: string | null | undefined,
  placementDateForLot: string,
  toast: ToastFn
): Promise<boolean> {
  const weekAgeData = new Map<number, Map<number, Set<string>>>();
  const existingReports = await api.dailyReports.list(farmId ?? undefined, lot ?? undefined);
  for (const existing of existingReports) {
    if (updatingIds.has(existing.id)) continue;
    if (!existing.reportDate || existing.ageJour == null) continue;
    const { semaine } = computeAgeAndSemaine(existing.reportDate, placementDateForLot);
    if (!weekAgeData.has(semaine)) weekAgeData.set(semaine, new Map());
    const ageMap = weekAgeData.get(semaine)!;
    if (!ageMap.has(existing.ageJour)) ageMap.set(existing.ageJour, new Set());
    ageMap.get(existing.ageJour)!.add(existing.reportDate);
  }
  for (const row of rowsWithCalculatedAge) {
    if (!row.report_date || !row.age_jour || row.age_jour.trim() === "") continue;
    const age = parseInt(row.age_jour, 10);
    const { semaine } = computeAgeAndSemaine(row.report_date, placementDateForLot);
    if (!weekAgeData.has(semaine)) weekAgeData.set(semaine, new Map());
    const ageMap = weekAgeData.get(semaine)!;
    if (!ageMap.has(age)) ageMap.set(age, new Set());
    ageMap.get(age)!.add(row.report_date);
  }
  for (const [, ageMap] of weekAgeData) {
    for (const [age, dates] of ageMap) {
      if (dates.size > 1) {
        const dateList = Array.from(dates)
          .map((d) => d.split("-").reverse().join("/"))
          .join(", ");
        toast({
          title: "Âge en double sur différentes dates",
          description: `L'âge ${age} apparaît sur plusieurs dates (${dateList}). Chaque âge doit correspondre à une seule date.`,
          variant: "destructive",
        });
        return false;
      }
    }
  }
  return true;
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
  const { toast } = useToast();
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  /** NBR / eau / températures : brut au focus, groupé au blur (Livraisons Aliment). */
  const [numericFocusKey, setNumericFocusKey] = useState<string | null>(null);
  const [placementDateForLot, setPlacementDateForLot] = useState<string | null>(null);
  /** Min(earliest report, placement) when reports exist — same as load() for âge/semaine on new lines. */
  const effectivePlacementRef = useRef<string | null>(null);
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

  /** Load setup info + resolve placement (setup dates or placements API) before clearing setupLoading so first load() has placement. */
  useEffect(() => {
    if (!lot || lot.trim() === "") {
      setSetupConfigs([]);
      setPlacementDateForLot(null);
      setSetupLoading(false);
      return;
    }
    let cancelled = false;
    const lotTrimmed = lot.trim();
    setSetupLoading(true);
    api.setupInfo
      .list(farmId ?? undefined, lotTrimmed)
      .then(async (list: SetupInfoResponse[]) => {
        if (cancelled) return;
        const configs: BuildingSexConfig[] = list.map((s) => ({
          building: s.building,
          sex: s.sex,
        }));
        setSetupConfigs(configs);
        const placement = await resolvePlacementDateForLot(list, farmId ?? null, lotTrimmed);
        if (cancelled) return;
        setPlacementDateForLot(placement);
      })
      .catch(() => {
        if (cancelled) return;
        setSetupConfigs([]);
        setPlacementDateForLot(null);
      })
      .finally(() => {
        if (!cancelled) setSetupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId, lot]);

  /** Create empty rows for all building+sex configurations from setup info.
   * Uses effectivePlacement when provided (min of placement and minReportDate) so first day = age 1. */
  const createEmptyRowsFromSetup = useCallback((forDate: string, effectivePlacementArg?: string | null): DailyRow[] => {
    const placement = effectivePlacementArg ?? placementDateForLot;
    if (setupConfigs.length === 0) {
      let empty = emptyRow(forDate);
      if (placement) {
        const { age, semaine } = computeAgeAndSemaine(empty.report_date, placement);
        empty = { ...empty, age_jour: String(age), semaine: String(semaine) };
      }
      return [empty];
    }
    return createRowsForConfigs(setupConfigs, forDate, placement);
  }, [setupConfigs, placementDateForLot]);

  const load = useCallback(async () => {
    console.log("🔄 DailyReportTable - Loading with:", { farmId, lot, initialDate, isNewReport, placementDateForLot, setupLoading });
    
    // Wait for setup info to load before proceeding (ensures placementDateForLot is available)
    if (setupLoading) {
      console.log("⏳ Waiting for setup info to load...");
      return;
    }
    
    setLoading(true);
    const todayStr = new Date().toISOString().split("T")[0];
    let forDate = initialDate ?? todayStr;
    try {
      const list = await api.dailyReports.list(farmId ?? undefined, lot ?? undefined);
      console.log("✅ DailyReportTable - Daily reports loaded:", { count: list.length, list });
      // For "Nouveau rapport": use next day after last saved report so each day has a unique age (no duplication)
      if (isNewReport && list.length > 0) {
        const existingDates = new Set(list.map((r) => r.reportDate).filter((d): d is string => d != null && d.trim() !== ""));
        const maxReportDate = list.reduce((max, r) => (r.reportDate > max ? r.reportDate : max), list[0].reportDate);
        forDate = addDays(maxReportDate, 1);
        // Ensure we never pick a date that already has reports (handles race/stale data)
        while (existingDates.has(forDate)) {
          forDate = addDays(forDate, 1);
        }
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
      let effectivePlacement: string | null = placementDateForLot;
      if (placementDateForLot && list.length > 0) {
        const minReportDate = list.reduce((min, r) => (r.reportDate < min ? r.reportDate : min), list[0].reportDate);
        effectivePlacement = minReportDate < placementDateForLot ? minReportDate : placementDateForLot;
      }
      effectivePlacementRef.current = effectivePlacement;
      if (effectivePlacement) {
        mapped = mapped.map((r) => {
          const { age, semaine } = computeAgeAndSemaine(r.report_date, effectivePlacement);
          return { ...r, age_jour: String(age), semaine: String(semaine) };
        });
      }

      // When "Nouveau rapport" (and not refreshing after multi-date save): full effectif template for that day
      if (isNewReport && !skipDateFilter) {
        const emptyRows = createEmptyRowsFromSetup(forDate, effectivePlacement);
        setRows(emptyRows);
      } else {
        if (isReadOnly) {
          setRows(sortRowsByEffectifOrder(mapped, setupConfigs));
        } else if (setupConfigs.length > 0) {
          const padDateIfEmpty =
            initialDate && !isNewReport && !skipDateFilter ? initialDate : null;
          setRows(
            mergeEffectifDraftsForDates(mapped, setupConfigs, effectivePlacement, padDateIfEmpty)
          );
        } else if (mapped.length > 0) {
          setRows(mapped);
        } else {
          setRows([]);
        }
      }
    } catch (error) {
      console.error("❌ DailyReportTable - Error loading daily reports:", error);
      if (isNewReport) {
        setRows(createEmptyRowsFromSetup(forDate, placementDateForLot));
      } else {
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [initialDate, farmId, lot, isReadOnly, placementDateForLot, isNewReport, createEmptyRowsFromSetup, setupLoading, setupConfigs]);

  useEffect(() => {
    // Only load when setup info is ready
    if (!setupLoading) {
      load();
    }
  }, [load, setupLoading]);

  const addRow = () => {
    const placement = effectivePlacementRef.current ?? placementDateForLot;
    const last = rows[rows.length - 1];
    let reportDate = last?.report_date ?? dateContext;

    if (setupConfigs.length > 0) {
      const combosForDate = (d: string) =>
        new Set(rows.filter((r) => r.report_date === d).map((r) => `${r.building}|${r.designation}`));
      const allCombosFilledForDate = (d: string) => {
        const ex = combosForDate(d);
        return setupConfigs.every((c) => ex.has(`${c.building}|${c.sex}`));
      };
      if (last && allCombosFilledForDate(last.report_date)) {
        reportDate = addDays(last.report_date, 1);
      }
      const existing = combosForDate(reportDate);
      const missingConfigs = setupConfigs.filter((c) => !existing.has(`${c.building}|${c.sex}`));
      const configsToAdd = missingConfigs.length > 0 ? missingConfigs : setupConfigs;
      const newRows = createRowsForConfigs(configsToAdd, reportDate, placement);
      setRows((prev) => sortRowsByEffectifOrder([...prev, ...newRows], setupConfigs));
    } else {
      if (last?.report_date) {
        reportDate = addDays(last.report_date, 1);
      }
      let newRow: DailyRow = {
        ...emptyRow(dateContext),
        id: crypto.randomUUID(),
        report_date: reportDate,
        age_jour: "",
        semaine: "",
      };
      if (placement && newRow.report_date) {
        const { age, semaine } = computeAgeAndSemaine(newRow.report_date, placement);
        newRow = { ...newRow, age_jour: String(age), semaine: String(semaine) };
      }
      setRows((prev) => [...prev, newRow]);
    }
  };

  const removeRow = async (id: string) => {
    if (rows.length === 0) return;
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

  const toRequest = (r: DailyRow): DailyReportRequest => {
    const request = {
      reportDate: r.report_date,
      ageJour: r.age_jour.trim() !== "" ? parseInt(r.age_jour, 10) : null,
      semaine: r.semaine.trim() !== "" ? parseInt(r.semaine, 10) : null,
      lot: lot?.trim() || null,
      building: r.building,
      designation: r.designation,
      nbr: Math.max(0, Math.round(toNum(r.nbr))),
      waterL: r.water_l.trim() !== "" ? toNum(r.water_l) : null,
      tempMin: r.temp_min.trim() !== "" ? toNum(r.temp_min) : null,
      tempMax: r.temp_max.trim() !== "" ? toNum(r.temp_max) : null,
      traitement: r.traitement.trim() || null,
      verified: r.verified,
    };
    console.log("📤 toRequest:", { 
      rowId: r.id, 
      age_jour_raw: r.age_jour, 
      age_jour_trimmed: r.age_jour.trim(),
      ageJour_result: request.ageJour,
      reportDate: request.reportDate,
      building: request.building,
      designation: request.designation
    });
    return request;
  };

  /** Enregistrement par ligne (✓), comme Livraisons Aliment. Validations globales (âges / doublons) sur toutes les lignes valides. */
  const saveRow = async (row: DailyRow) => {
    const saved = isSavedRow(row.id);
    if (saved && !canUpdate) return;
    if (!saved && !canCreate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas créer de données.", variant: "destructive" });
      return;
    }
    if (!isRowValidForSave(row)) {
      toast({
        title: "Ligne incomplète",
        description: "Renseignez la date, le bâtiment, la désignation et le NBR.",
        variant: "destructive",
      });
      return;
    }

    const validRows = rows.filter(isRowValidForSave);
    if (!verifyNoDuplicateCombos(validRows, toast)) return;

    const rowsWithCalculatedAge = validRows.map((r) => {
      if (placementDateForLot && r.report_date) {
        const { age, semaine } = computeAgeAndSemaine(r.report_date, placementDateForLot);
        return { ...r, age_jour: String(age), semaine: String(semaine) };
      }
      return r;
    });

    const updatingIds = saved ? new Set([parseInt(row.id, 10)]) : new Set<number>();
    if (placementDateForLot) {
      const ok = await checkAgeWeekConsistency(
        rowsWithCalculatedAge,
        updatingIds,
        farmId,
        lot,
        placementDateForLot,
        toast
      );
      if (!ok) return;
    }

    setRows((prevRows) =>
      prevRows.map((r) => rowsWithCalculatedAge.find((ur) => ur.id === r.id) ?? r)
    );

    const recalced = rowsWithCalculatedAge.find((r) => r.id === row.id);
    if (!recalced) return;

    setSavingRowId(row.id);
    try {
      if (canUpdate) {
        if (saved) {
          await api.dailyReports.update(parseInt(row.id, 10), toRequest(recalced));
        } else {
          await api.dailyReports.createBatch([toRequest(recalced)], farmId ?? undefined);
        }
      } else {
        const d = recalced.report_date;
        const forDate = rowsWithCalculatedAge.filter((r) => r.report_date === d);
        await api.dailyReports.replaceBatch(d, forDate.map(toRequest), farmId ?? undefined);
      }

      toast({
        title: "Ligne enregistrée",
        description: `Le rapport du ${recalced.report_date.split("-").reverse().join("/")} a été enregistré.`,
      });

      if (isNewReport && onSaveSuccess && !saved) {
        onSaveSuccess(recalced.report_date);
      } else {
        await load();
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible d'enregistrer la ligne.", variant: "destructive" });
    } finally {
      setSavingRowId(null);
    }
  };

  const totalMortality = rows.reduce((s, r) => s + toNum(r.nbr), 0);

  const showSaveCol = !isReadOnly && (canCreate || canUpdate);
  const showDeleteCol = !isReadOnly && canDelete;

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
        {!isReadOnly && canCreate && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Ligne
            </button>
          </div>
        )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-farm">
          <thead>
            <tr>
              <th className="min-w-[70px]" title="Âge (jours)">AGE</th>
              <th className="min-w-[100px]">DATE</th>
              <th className="min-w-[56px]">SEM</th>
              <th className="min-w-[120px]">BÂTIMENT</th>
              <th className="min-w-[100px]">DÉSIGNATION</th>
              <th className="min-w-[96px] !text-center">NBR (MORTALITÉ)</th>
              <th className="min-w-[128px] w-[8.5rem] !text-center">CONSO. EAU (L)</th>
              <th className="min-w-[88px] !text-center">TEMP. MIN</th>
              <th className="min-w-[88px] !text-center">TEMP. MAX</th>
              <th className="min-w-[120px]">TRAITEMENT</th>
              {showSaveCol ? (
                <th className="w-9 min-w-0 !px-1" title="Enregistrer la ligne">
                  ✓
                </th>
              ) : null}
              {showDeleteCol ? <th className="w-10"></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const saved = isSavedRow(row.id);
              const readOnly = isReadOnly || (saved && !canUpdate);
              const canSaveRow = showSaveCol && ((!saved && canCreate) || (saved && canUpdate));
              const canDeleteThisRow = canDelete && !(isResponsableFerme && saved);
              return (
                <tr key={row.id}>
                  <td className="text-sm font-medium text-muted-foreground tabular-nums">
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
                  <td className="text-center">
                    {readOnly ? (
                      <span className="block text-center tabular-nums px-1 py-0.5">{formatIntDisplay(row.nbr)}</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={
                          numericFocusKey === dailyNumericFocusKey(row.id, "nbr")
                            ? row.nbr
                            : toOptionalNumber(row.nbr) != null
                              ? formatGroupedNumber(toOptionalNumber(row.nbr)!, 0)
                              : ""
                        }
                        onFocus={() => setNumericFocusKey(dailyNumericFocusKey(row.id, "nbr"))}
                        onBlur={(e) => {
                          setNumericFocusKey(null);
                          const raw = e.target.value;
                          if (raw.trim() === "") {
                            updateRow(row.id, "nbr", "");
                            return;
                          }
                          const n = toOptionalNumber(raw);
                          if (n == null || n < 0) {
                            updateRow(row.id, "nbr", "");
                          } else {
                            updateRow(row.id, "nbr", String(Math.round(n)));
                          }
                        }}
                        onChange={(e) => updateRow(row.id, "nbr", e.target.value)}
                        placeholder="—"
                        className="w-full min-w-[5rem] tabular-nums text-center"
                      />
                    )}
                  </td>
                  <td className="min-w-[128px] text-center">
                    {readOnly ? (
                      <span className="block text-center tabular-nums px-1 py-0.5">{formatDecDisplay(row.water_l)}</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          numericFocusKey === dailyNumericFocusKey(row.id, "water_l")
                            ? row.water_l
                            : toOptionalNumber(row.water_l) != null
                              ? formatGroupedNumber(toOptionalNumber(row.water_l)!, 2)
                              : ""
                        }
                        onFocus={() => setNumericFocusKey(dailyNumericFocusKey(row.id, "water_l"))}
                        onBlur={(e) => {
                          setNumericFocusKey(null);
                          const raw = e.target.value;
                          if (raw.trim() === "") {
                            updateRow(row.id, "water_l", "");
                            return;
                          }
                          const n = toOptionalNumber(raw);
                          if (n == null || n < 0) {
                            updateRow(row.id, "water_l", "");
                          } else {
                            updateRow(row.id, "water_l", n.toFixed(2));
                          }
                        }}
                        onChange={(e) => updateRow(row.id, "water_l", e.target.value)}
                        placeholder="—"
                        className="w-full min-w-[7.5rem] tabular-nums text-center"
                      />
                    )}
                  </td>
                  <td className="text-center">
                    {readOnly ? (
                      <span className="block text-center tabular-nums px-1 py-0.5">{formatDecDisplay(row.temp_min)}</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          numericFocusKey === dailyNumericFocusKey(row.id, "temp_min")
                            ? row.temp_min
                            : toOptionalNumber(row.temp_min) != null
                              ? formatGroupedNumber(toOptionalNumber(row.temp_min)!, 2)
                              : ""
                        }
                        onFocus={() => setNumericFocusKey(dailyNumericFocusKey(row.id, "temp_min"))}
                        onBlur={(e) => {
                          setNumericFocusKey(null);
                          const raw = e.target.value;
                          if (raw.trim() === "") {
                            updateRow(row.id, "temp_min", "");
                            return;
                          }
                          const n = toOptionalNumber(raw);
                          if (n == null) {
                            updateRow(row.id, "temp_min", "");
                          } else {
                            updateRow(row.id, "temp_min", n.toFixed(2));
                          }
                        }}
                        onChange={(e) => updateRow(row.id, "temp_min", e.target.value)}
                        placeholder="—"
                        className="w-full min-w-[5.5rem] tabular-nums text-center"
                      />
                    )}
                  </td>
                  <td className="text-center">
                    {readOnly ? (
                      <span className="block text-center tabular-nums px-1 py-0.5">{formatDecDisplay(row.temp_max)}</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          numericFocusKey === dailyNumericFocusKey(row.id, "temp_max")
                            ? row.temp_max
                            : toOptionalNumber(row.temp_max) != null
                              ? formatGroupedNumber(toOptionalNumber(row.temp_max)!, 2)
                              : ""
                        }
                        onFocus={() => setNumericFocusKey(dailyNumericFocusKey(row.id, "temp_max"))}
                        onBlur={(e) => {
                          setNumericFocusKey(null);
                          const raw = e.target.value;
                          if (raw.trim() === "") {
                            updateRow(row.id, "temp_max", "");
                            return;
                          }
                          const n = toOptionalNumber(raw);
                          if (n == null) {
                            updateRow(row.id, "temp_max", "");
                          } else {
                            updateRow(row.id, "temp_max", n.toFixed(2));
                          }
                        }}
                        onChange={(e) => updateRow(row.id, "temp_max", e.target.value)}
                        placeholder="—"
                        className="w-full min-w-[5.5rem] tabular-nums text-center"
                      />
                    )}
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
                  {showSaveCol ? (
                    <td className="w-9 max-w-9 shrink-0 !px-1 text-center align-middle">
                      {canSaveRow && (
                        <button
                          type="button"
                          onClick={() => saveRow(row)}
                          disabled={savingRowId != null}
                          className="text-muted-foreground hover:text-primary transition-colors p-0.5 inline-flex justify-center"
                          title="Enregistrer cette ligne"
                        >
                          {savingRowId === row.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  ) : null}
                  {showDeleteCol ? (
                    <td>
                      {canDeleteThisRow ? (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60">
              <td colSpan={5} className="text-right font-semibold text-sm px-3 py-2 text-muted-foreground">
                Total Mortalité du jour :
              </td>
              <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap font-bold text-sm text-destructive">
                {formatGroupedNumber(totalMortality, 0)}
              </td>
              <td colSpan={4 + (showSaveCol ? 1 : 0) + (showDeleteCol ? 1 : 0)}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
