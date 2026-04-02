import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Save, Trash2, Loader2, Check } from "lucide-react";
import { api, type SuiviTechniqueHebdoResponse, type SuiviTechniqueHebdoRequest, type DailyReportResponse } from "@/lib/api";
import {
  mergeHebdoRowsWithDailyReports,
  resolveAnchorRecordDateForEffectif,
  dailyReportMatchesSuiviContext,
} from "@/lib/mergeDailyReportsIntoWeeklyHebdo";
import { fetchMortaliteCumulFinSemainePrecedente } from "@/lib/mortalitePrevWeekCumul";
import { canonicalSemaine } from "@/lib/semaineCanonical";
import { formatGroupedNumber } from "@/lib/formatResumeAmount";
import {
  SUIVI_HEBDO_EXPORT_HEADERS,
  SUIVI_HEBDO_HEADER_TITLE,
  SUIVI_HEBDO_PRIMARY_HEADER_GROUPS,
  SUIVI_HEBDO_SUBHEADER_LABEL,
  SUIVI_HEBDO_SUBHEADER_TH_CLASS,
  suiviHebdoTransportRowLabelColSpan,
} from "@/lib/suiviTechniqueHebdomadaireShared";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface WeeklyRow {
  id: string;
  recordDate: string;
  ageJour: string;
  mortaliteNbre: string;
  mortalitePct: string;
  mortaliteCumul: string;
  mortaliteCumulPct: string;
  /** Mortalité du transport — cumul fin semaine précédente (calculé côté backend) */
  mortaliteTransportCumul?: number | null;
  consoEauL: string;
  tempMin: string;
  tempMax: string;
  vaccination: string;
  traitement: string;
  observation: string;
  /** From API: true when age/mortalite/conso all null — placeholder rows stay editable */
  isPlaceholder?: boolean;
}

function emptyRow(date: string): WeeklyRow {
  return {
    id: crypto.randomUUID(),
    recordDate: date,
    ageJour: "",
    mortaliteNbre: "",
    mortalitePct: "",
    mortaliteCumul: "",
    mortaliteCumulPct: "",
    mortaliteTransportCumul: null,
    consoEauL: "",
    tempMin: "",
    tempMax: "",
    vaccination: "",
    traitement: "",
    observation: "",
  };
}

function isSavedRow(id: string): boolean {
  return /^\d+$/.test(id);
}

function parseDisplayFraction(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Mortalité % cells: API/computed strings use dot; display with grouped thousands + dot decimal. */
function formatPctCell(raw: string | undefined): string {
  const n = parseDisplayFraction(raw);
  if (n == null) return "—";
  return `${formatGroupedNumber(n, 2)} %`;
}

function formatIntCell(raw: string | undefined): string {
  if (raw == null || raw.trim() === "") return "—";
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return "—";
  return formatGroupedNumber(n, 0);
}

/** Row has meaningful daily data (age, mortality, water). Placeholder rows with only effectif_depart should stay editable. */
function hasMeaningfulDailyData(row: WeeklyRow): boolean {
  return (
    (row.ageJour?.trim() ?? "") !== "" ||
    (row.mortaliteNbre?.trim() ?? "") !== "" ||
    (row.consoEauL?.trim() ?? "") !== ""
  );
}

/** Persist merged rows one-by-one via PUT upsert; reload afterwards reads truth from the API. */
async function saveHebdoRequestsSequentially(rows: SuiviTechniqueHebdoRequest[], farmId: number): Promise<void> {
  const sorted = [...rows].sort((a, b) => (a.recordDate ?? "").localeCompare(b.recordDate ?? ""));
  for (const body of sorted) {
    await api.suiviTechniqueHebdo.save(body, farmId);
  }
}

function buildHebdoRequestFromRow(
  r: WeeklyRow,
  p: {
    lot: string;
    sex: string;
    batiment: string;
    semaine: string;
    effectifDepart: number | null;
  }
): SuiviTechniqueHebdoRequest {
  return {
    lot: p.lot,
    sex: p.sex,
    batiment: p.batiment,
    semaine: p.semaine,
    effectifDepart: p.effectifDepart,
    recordDate: r.recordDate,
    ageJour: r.ageJour.trim() !== "" ? parseInt(r.ageJour, 10) : null,
    mortaliteNbre: r.mortaliteNbre.trim() !== "" ? parseInt(r.mortaliteNbre, 10) : null,
    consoEauL: r.consoEauL.trim() !== "" ? parseFloat(r.consoEauL.replace(",", ".")) : null,
    tempMin: r.tempMin.trim() !== "" ? parseFloat(r.tempMin.replace(",", ".")) : null,
    tempMax: r.tempMax.trim() !== "" ? parseFloat(r.tempMax.replace(",", ".")) : null,
    vaccination: r.vaccination.trim() || null,
    traitement: r.traitement.trim() || null,
    observation: r.observation.trim() || null,
  };
}

function floatCloseEnough(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-5;
}

/** True when journalier should be written to DB: new unsaved merged lines, or saved lines still missing daily fields. */
function mergedWeekNeedsDbPersist(
  mapped: WeeklyRow[],
  list: SuiviTechniqueHebdoResponse[],
  dailyList: DailyReportResponse[],
  opts: { lot: string; batiment: string; sex: string; semaine: string }
): boolean {
  const hasNewUnsaved = mapped.some((row) => !isSavedRow(row.id) && hasMeaningfulDailyData(row));
  if (hasNewUnsaved) return true;

  const dailyWeek = dailyList.filter((d) => dailyReportMatchesSuiviContext(d, opts));
  if (dailyWeek.length === 0) return false;

  const byDate = new Map<string, DailyReportResponse>();
  for (const d of dailyWeek) {
    byDate.set(d.reportDate, d);
  }

  for (const row of mapped) {
    if (!isSavedRow(row.id) || !row.recordDate?.trim()) continue;
    const day = byDate.get(row.recordDate);
    if (!day) continue;
    const h = list.find((rec) => String(rec.id) === row.id);
    if (!h) continue;

    if (day.ageJour != null && (h.ageJour == null || h.ageJour !== day.ageJour)) return true;
    if (h.mortaliteNbre == null || h.mortaliteNbre !== day.nbr) return true;
    if (day.waterL != null && !floatCloseEnough(h.consoEauL ?? null, day.waterL)) return true;
    if (day.tempMin != null && !floatCloseEnough(h.tempMin ?? null, day.tempMin)) return true;
    if (day.tempMax != null && !floatCloseEnough(h.tempMax ?? null, day.tempMax)) return true;
    const dt = day.traitement?.trim() ?? "";
    const ht = h.traitement?.trim() ?? "";
    if (dt !== "" && dt !== ht) return true;
  }
  return false;
}

const ROWS_PER_WEEK = 7;

/** Previous semaine for effectif chain: S2 → S1, S3 → S2, etc. Returns null for S1 or non-Sn format. */
function previousSemaine(semaine: string): string | null {
  const m = semaine.trim().match(/^S(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 1) return null;
  return `S${n - 1}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Display yyyy-mm-dd as dd/mm/yyyy. Used for read-only rows so no browser date-picker icon appears. */
function formatIsoDateDisplay(iso: string): string {
  if (!iso?.trim()) return "—";
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function emptyWeekRows(startDate: string): WeeklyRow[] {
  return Array.from({ length: ROWS_PER_WEEK }, (_, i) => emptyRow(addDays(startDate, i)));
}

interface WeeklyTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Bâtiment for this tracking (used in list and save). */
  batiment?: string;
  effectifInitial?: number;
  /** Called after hebdo or effectif départ is saved so parent can refresh stock. */
  onSaveSuccess?: () => void;
  /**
   * When true, the table is fully read-only for everyone (no edit/add/save/delete),
   * regardless of role permissions. Useful when the table is treated as calculated-only.
   */
  forceReadOnly?: boolean;
}

export default function WeeklyTrackingTable({ farmId, lot, semaine, sex, batiment = "B1", effectifInitial, onSaveSuccess, forceReadOnly = false }: WeeklyTrackingTableProps) {
  const today = new Date().toISOString().split("T")[0];
  const { isReadOnly, canCreate, canUpdate, canDelete } = useAuth();
  const { toast } = useToast();
  const effectiveReadOnly = isReadOnly || forceReadOnly;

  /** Align with backend week keys (S02 → S2) for list/save/transport-cumul. */
  const semaineCanon = useMemo(() => canonicalSemaine(semaine), [semaine]);

  // Determine if this is the first week (S1) or subsequent weeks (S2+)
  const isFirstWeek = previousSemaine(semaineCanon) === null;

  const [effectifDepart, setEffectifDepart] = useState<string>("");
  /** True when effectif départ was loaded from API (already saved). RESPONSABLE_FERME cannot modify after save (permission.mdc). */
  const [hasSavedEffectif, setHasSavedEffectif] = useState(false);

  const [rows, setRows] = useState<WeeklyRow[]>(() => emptyWeekRows(today));
  const [loading, setLoading] = useState(true);
  /** Row id (string) while that row's daily data is being saved */
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [savingEffectif, setSavingEffectif] = useState(false);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    const prevSem = previousSemaine(semaineCanon);
    try {
      const [list, dailyList, stockPrev] = await Promise.all([
        api.suiviTechniqueHebdo.list({ farmId, lot, sex, batiment, semaine: semaineCanon }),
        api.dailyReports.list(farmId, lot).catch((): DailyReportResponse[] => []),
        prevSem != null
          ? api.suiviStock
              .get({ farmId, lot, semaine: prevSem, sex, batiment: batiment ?? undefined })
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (gen !== loadGenRef.current) return;

      const mapped: WeeklyRow[] = mergeHebdoRowsWithDailyReports(list, dailyList, {
        lot,
        batiment,
        sex,
        semaine: semaineCanon,
      }) as WeeklyRow[];

      const mergeOpts = { lot, batiment, sex, semaine: semaineCanon };
      const needsPersistMergedWeek =
        mergedWeekNeedsDbPersist(mapped, list, dailyList, mergeOpts) &&
        mapped.some((row) => row.recordDate?.trim());

      // Check if existing data needs transport cumulative recalculation
      // This happens when data was saved from other pages and transport cumul is missing or incorrect
      const needsTransportRecalculation = list.length > 0 && 
        (list.some(row => row.mortaliteTransportCumul == null) || // Missing transport cumul
         (!isFirstWeek && list.every(row => row.mortaliteTransportCumul === 0))); // All zeros for non-S1 weeks
      
      // If merged journalier/hebdo should be persisted OR transport cumul needs a backend pass
      if ((needsPersistMergedWeek || needsTransportRecalculation) && (canCreate || canUpdate) && !effectiveReadOnly) {
        try {
          if (needsPersistMergedWeek) {
            const weekEffectifDepart =
              list.find((rec) => rec.effectifDepart != null)?.effectifDepart ??
              (!isFirstWeek && prevSem != null ? stockPrev?.effectifRestantFinSemaine ?? null : null) ??
              (isFirstWeek && effectifInitial != null && effectifInitial > 0 ? effectifInitial : null);

            const rowsToSave = mapped
              .filter((row) => row.recordDate?.trim())
              .map((row) =>
                buildHebdoRequestFromRow(row, {
                  lot,
                  sex,
                  batiment,
                  semaine: semaineCanon,
                  effectifDepart: weekEffectifDepart,
                })
              );

            if (rowsToSave.length > 0) {
              await saveHebdoRequestsSequentially(rowsToSave, farmId);
            }
          } else if (needsTransportRecalculation) {
            // Force recalculation of transport cumulative for existing data
            await api.suiviTechniqueHebdo.getTransportCumul({ 
              farmId, lot, sex, batiment, semaine: semaineCanon, persist: true 
            });
          }
          
          // Reload data to get the calculated transport cumulative values
          const updatedList = await api.suiviTechniqueHebdo.list({ farmId, lot, sex, batiment, semaine: semaineCanon });
          const updatedMapped: WeeklyRow[] = mergeHebdoRowsWithDailyReports(updatedList, dailyList, {
            lot,
            batiment,
            sex,
            semaine: semaineCanon,
          }) as WeeklyRow[];
          setRows(updatedMapped.length >= ROWS_PER_WEEK ? updatedMapped : [...updatedMapped, ...Array.from({ length: ROWS_PER_WEEK - updatedMapped.length }, (_, i) => emptyRow(addDays(updatedMapped[updatedMapped.length - 1]?.recordDate || today, i + 1)))]);
          const savedEffectif = updatedList.length > 0 && updatedList.some((r) => r.effectifDepart != null);
          setHasSavedEffectif(!!savedEffectif);
          return; // Skip the rest of the loading logic since we've already set the rows
        } catch (error) {
          console.warn("Auto-recalculation of transport cumulative failed:", error);
        }
      }
      
      const savedEffectif = list.length > 0 && list.some((r) => r.effectifDepart != null);
      setHasSavedEffectif(!!savedEffectif);
      // When no data (e.g. after "delete sex data"), ensure table is fully editable
      if (list.length === 0) {
        setHasSavedEffectif(false);
      }

      let shouldAutoSaveEffectif = false;
      if (list.length > 0 && list[0].effectifDepart != null) {
        setEffectifDepart(String(list[0].effectifDepart));
      } else if (isFirstWeek && effectifInitial != null && effectifInitial > 0) {
        setEffectifDepart(String(effectifInitial));
        shouldAutoSaveEffectif = (canCreate || canUpdate);
      } else if (prevSem != null && stockPrev?.effectifRestantFinSemaine != null) {
        setEffectifDepart(String(stockPrev.effectifRestantFinSemaine));
        shouldAutoSaveEffectif = !isFirstWeek && (canCreate || canUpdate);
      }

      if (gen !== loadGenRef.current) return;

      // Display exactly 7 rows by default (one per day). User can add more via "+ Ligne".
      if (effectiveReadOnly) {
        if (mapped.length === 0) {
          setRows(emptyWeekRows(today));
        } else if (mapped.length < ROWS_PER_WEEK) {
          const lastDate = mapped[mapped.length - 1].recordDate;
          const padCount = ROWS_PER_WEEK - mapped.length;
          const padRows = Array.from({ length: padCount }, (_, i) => emptyRow(addDays(lastDate, i + 1)));
          setRows([...mapped, ...padRows]);
        } else {
          setRows(mapped);
        }
      } else if (mapped.length >= ROWS_PER_WEEK) {
        setRows(mapped);
      } else if (mapped.length > 0) {
        const lastDate = mapped[mapped.length - 1].recordDate;
        const padCount = ROWS_PER_WEEK - mapped.length;
        const padRows = Array.from({ length: padCount }, (_, i) => emptyRow(addDays(lastDate, i + 1)));
        setRows([...mapped, ...padRows]);
      } else {
        setRows(emptyWeekRows(today));
      }

      const effectifValForAutoSave =
        isFirstWeek && effectifInitial != null && effectifInitial > 0
          ? effectifInitial
          : stockPrev?.effectifRestantFinSemaine ?? null;

      if (shouldAutoSaveEffectif && effectifValForAutoSave != null) {
        try {
          const effectifVal = effectifValForAutoSave;
          const effectifPayloads: SuiviTechniqueHebdoRequest[] =
            mapped.filter((r) => r.recordDate?.trim()).length > 0
              ? mapped
                  .filter((r) => r.recordDate?.trim())
                  .map((r) =>
                    buildHebdoRequestFromRow(r, {
                      lot,
                      sex,
                      batiment,
                      semaine: semaineCanon,
                      effectifDepart: effectifVal,
                    })
                  )
              : [
                  {
                    lot,
                    sex,
                    batiment,
                    semaine: semaineCanon,
                    effectifDepart: effectifVal,
                    recordDate: resolveAnchorRecordDateForEffectif(
                      list,
                      dailyList,
                      { lot, batiment, sex, semaine: semaineCanon },
                      today
                    ),
                    ageJour: null,
                    mortaliteNbre: null,
                    consoEauL: null,
                    tempMin: null,
                    tempMax: null,
                    vaccination: null,
                    traitement: null,
                    observation: null,
                  },
                ];
          await saveHebdoRequestsSequentially(effectifPayloads, farmId);
          if (gen === loadGenRef.current) {
            setHasSavedEffectif(true);
            toast({
              title: "Effectif départ calculé",
              description: isFirstWeek
                ? `Effectif départ de ${semaineCanon} enregistré depuis Infos setup: ${effectifVal}`
                : `Effectif départ de ${semaineCanon} automatiquement calculé et enregistré: ${effectifVal}`,
              duration: 3000,
            });
            onSaveSuccess?.();
          }
        } catch (error) {
          console.warn("Auto-save of calculated effectif failed:", error);
        }
      }
    } catch {
      /* API error — logged in backend only */
      if (gen === loadGenRef.current) {
        setRows(emptyWeekRows(today));
        setHasSavedEffectif(false);
      }
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [
    farmId,
    lot,
    sex,
    batiment,
    semaineCanon,
    effectiveReadOnly,
    toast,
    today,
    canCreate,
    canUpdate,
    isFirstWeek,
    onSaveSuccess,
    effectifInitial,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Valeur « MORTALITE DU TRANSPORT » (offset) pour la semaine courante, **même bâtiment + sexe** que ce tableau:
   * - S2 B1 Mâle = total cumul mortalité fin S1 pour B1 Mâle (lot/farm identiques)
   * - S3 = total cumul mortalité fin S2 sur ce même scope ; etc.
   * S1 affiche 0. Source: mortaliteTransportCumul calculé côté backend et persisté dans les données.
   */
  const mortaliteTransportFromBackend = useMemo(() => {
    if (isFirstWeek) return 0;
    
    // Get transport cumul from the first row that has it (all rows in the week should have the same value)
    const firstRowWithTransport = rows.find(row => 
      isSavedRow(row.id) && 
      row.mortaliteTransportCumul !== undefined && 
      row.mortaliteTransportCumul !== null
    );
    
    return firstRowWithTransport?.mortaliteTransportCumul ?? null;
  }, [rows, isFirstWeek]);

  // Fallback to API call if backend value is not available (for backward compatibility)
  const [prevWeekEndCumulMortalite, setPrevWeekEndCumulMortalite] = useState<number | null>(null);

  useEffect(() => {
    if (mortaliteTransportFromBackend !== null) {
      setPrevWeekEndCumulMortalite(mortaliteTransportFromBackend);
      return;
    }
    
    if (isFirstWeek) {
      setPrevWeekEndCumulMortalite(0);
      return;
    }
    
    let cancelled = false;
    setPrevWeekEndCumulMortalite(null);
    fetchMortaliteCumulFinSemainePrecedente(farmId, lot, sex, batiment, semaineCanon)
      .then((total) => {
        if (!cancelled) setPrevWeekEndCumulMortalite(total);
      })
      .catch(() => {
        if (!cancelled) setPrevWeekEndCumulMortalite(0);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId, lot, sex, batiment, semaineCanon, isFirstWeek, mortaliteTransportFromBackend]);

  const addRow = () => {
    if (effectiveReadOnly) return;
    const last = rows[rows.length - 1];
    // Calculate next date
    let nextDate = today;
    if (last?.recordDate) {
      const d = new Date(last.recordDate);
      d.setDate(d.getDate() + 1);
      nextDate = d.toISOString().split("T")[0];
    }
    // Calculate next age
    let nextAge = "";
    if (last?.ageJour) {
      nextAge = String(parseInt(last.ageJour) + 1);
    }
    setRows((prev) => [
      ...prev,
      {
        ...emptyRow(nextDate),
        ageJour: nextAge,
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (effectiveReadOnly) return;
    if (rows.length <= ROWS_PER_WEEK) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const saved = isSavedRow(row.id);
    if (saved && !canDelete) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof WeeklyRow, value: string) => {
    // Enforce permission.mdc at the state-update level (not only via input attributes):
    // - Read-only roles cannot edit anything
    // - RESPONSABLE_FERME (create-only) may edit only non-saved rows OR backend placeholders
    // - Saved non-placeholder rows require update permission
    if (effectiveReadOnly || (!canCreate && !canUpdate)) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const saved = isSavedRow(r.id);
        const isPlaceholder = r.isPlaceholder ?? !hasMeaningfulDailyData(r);
        if (saved && !canUpdate && !isPlaceholder) return r;
        return { ...r, [field]: value };
      })
    );
  };

  const rowToRequest = (r: WeeklyRow): SuiviTechniqueHebdoRequest =>
    buildHebdoRequestFromRow(r, {
      lot,
      sex,
      batiment,
      semaine: semaineCanon,
      effectifDepart: effectifDepart.trim() !== "" ? parseInt(effectifDepart, 10) : null,
    });

  /** Per-row save: PUT upsert only (backend allows merge into placeholder rows without update permission). */
  const saveRow = async (row: WeeklyRow) => {
    if (effectiveReadOnly) return;
    if (!canCreate && !canUpdate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas enregistrer.", variant: "destructive" });
      return;
    }
    if (!row.recordDate?.trim()) {
      toast({
        title: "Ligne incomplète",
        description: "Renseignez une date.",
        variant: "destructive",
      });
      return;
    }
    if (row.mortaliteNbre.trim() === "" && row.consoEauL.trim() === "") {
      toast({
        title: "Ligne incomplète",
        description: "Renseignez au moins la mortalité (nombre) ou la consommation d'eau.",
        variant: "destructive",
      });
      return;
    }

    const saved = isSavedRow(row.id);
    const isPlaceholder = row.isPlaceholder ?? !hasMeaningfulDailyData(row);
    if (saved && !canUpdate && !isPlaceholder) return;

    const payload = rowToRequest(row);

    setSavingRowId(row.id);
    try {
      await api.suiviTechniqueHebdo.save(payload, farmId);
      toast({ title: "Ligne enregistrée", description: "Données du jour sauvegardées." });
      onSaveSuccess?.();
      await load();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setSavingRowId(null);
    }
  };

  /** Rows eligible for effectif save: have recordDate and (user can update any row, or row is not yet saved). RESPONSABLE_FERME can only create — cannot include saved rows. */
  const effectifEligibleRowCount = useMemo(
    () =>
      rows.filter((r) => r.recordDate && r.recordDate.trim() !== "").filter((r) => canUpdate || !isSavedRow(r.id))
        .length,
    [rows, canUpdate]
  );
  /** RESPONSABLE_FERME cannot update after save: once effectif départ was saved, they cannot modify it (permission.mdc). */
  const canSaveEffectif =
    !effectiveReadOnly && (canCreate || canUpdate) && effectifEligibleRowCount > 0 && (canUpdate || !hasSavedEffectif);
  /** Effectif input read-only when: full read-only, or effectif was already saved and user cannot update (e.g. RESPONSABLE_FERME), or it's week 2+ (auto-calculated). */
  const effectifInputReadOnly =
    effectiveReadOnly || (hasSavedEffectif && !canUpdate) || !isFirstWeek;

  /** Save only effectif départ de la semaine. Respects permission.mdc: create for new rows, update for existing (RESPONSABLE_FERME cannot update). */
  const handleSaveEffectifDepart = async () => {
    if (!canSaveEffectif) {
      if (!canCreate && !canUpdate) {
        toast({ title: "Non autorisé", description: "Vous ne pouvez pas enregistrer l'effectif départ.", variant: "destructive" });
      } else if (hasSavedEffectif && !canUpdate) {
        toast({
          title: "Modification non autorisée",
          description: "L'effectif départ a déjà été enregistré. Vous ne pouvez pas le modifier après enregistrement.",
          variant: "destructive",
        });
      } else if (effectifEligibleRowCount === 0) {
        toast({
          title: "Impossible d'enregistrer",
          description: "Vous ne pouvez pas modifier l'effectif après enregistrement (lignes déjà sauvegardées).",
          variant: "destructive",
        });
      }
      return;
    }
    const effectifVal = effectifDepart.trim() !== "" ? parseInt(effectifDepart, 10) : null;
    if (effectifVal != null && (Number.isNaN(effectifVal) || effectifVal < 0)) {
      toast({ title: "Valeur invalide", description: "Saisissez un effectif départ valide (nombre ≥ 0).", variant: "destructive" });
      return;
    }
    // Build batch: rows with recordDate, respecting canUpdate (exclude saved rows if user cannot update)
    const toSend: SuiviTechniqueHebdoRequest[] = rows
      .filter((r) => r.recordDate && r.recordDate.trim() !== "")
      .filter((r) => canUpdate || !isSavedRow(r.id))
      .map((r) => ({
        lot,
        sex,
        batiment,
        semaine: semaineCanon,
        effectifDepart: effectifVal ?? null,
        recordDate: r.recordDate,
        ageJour: r.ageJour.trim() !== "" ? parseInt(r.ageJour) : null,
        mortaliteNbre: r.mortaliteNbre.trim() !== "" ? parseInt(r.mortaliteNbre) : null,
        consoEauL: r.consoEauL.trim() !== "" ? parseFloat(r.consoEauL) : null,
        tempMin: r.tempMin.trim() !== "" ? parseFloat(r.tempMin) : null,
        tempMax: r.tempMax.trim() !== "" ? parseFloat(r.tempMax) : null,
        vaccination: r.vaccination.trim() || null,
        traitement: r.traitement.trim() || null,
        observation: r.observation.trim() || null,
      }));
    if (toSend.length === 0) {
      toast({
        title: "Impossible d'enregistrer",
        description: "Aucune ligne éligible. Vous ne pouvez pas modifier l'effectif sur des lignes déjà enregistrées.",
        variant: "destructive",
      });
      return;
    }
    setSavingEffectif(true);
    try {
      await saveHebdoRequestsSequentially(toSend, farmId);
      setHasSavedEffectif(true);
      toast({ title: "Effectif enregistré", description: "Effectif départ de la semaine enregistré." });
      onSaveSuccess?.();
      await load();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setSavingEffectif(false);
    }
  };

  // Calculate totals for current week
  const weeklyTotals = useMemo(() => {
    const totalMortality = rows.reduce((s, r) => s + (parseInt(r.mortaliteNbre) || 0), 0);
    const totalWater = rows.reduce((s, r) => s + (parseFloat(r.consoEauL) || 0), 0);
    return { totalMortality, totalWater };
  }, [rows]);

  /**
   * S1 often has no `effectifDepart` in state until the user clicks « Enregistrer effectif », while S2+
   * already get a positive effectif from stock. Use the setup effectif (placeholder) as fallback so
   * % mortalité and cumuls match the behaviour of other semaines for display.
   */
  const effectifPourCalculMortalite = useMemo(() => {
    const trimmed = effectifDepart?.trim() ?? "";
    if (trimmed !== "") {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n) && n > 0) return n;
      return null;
    }
    if (effectifInitial != null && effectifInitial > 0) return effectifInitial;
    return null;
  }, [effectifDepart, effectifInitial]);

  /**
   * NEW LOGIC: Starting point for cumul calculation
   * S1: First day's mortalité NBRE value
   * S2+: Previous week's ending cumul
   * This is used to display and start cumul calculations from the correct baseline
   */
  const mortaliteTransportStartingPoint = useMemo(() => {
    if (isFirstWeek) {
      // S1: Get first day's mortalité NBRE if available
      const withDate = rows.filter((r) => r.recordDate && r.recordDate.trim() !== "");
      if (withDate.length === 0) return 0;
      const sorted = [...withDate].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
      const firstRowNbre = parseInt(sorted[0].mortaliteNbre, 10) || 0;
      return firstRowNbre;
    } else {
      // S2+: Use previous week's ending cumul
      if (prevWeekEndCumulMortalite === null) return 0;
      return prevWeekEndCumulMortalite;
    }
  }, [isFirstWeek, rows, prevWeekEndCumulMortalite]);

  /** Cumul mortalité fin de semaine = sum of all NBRE up to and including the last day.
   * For S2+, includes starting point from previous week. */
  const totalMortaliteCumulFinSemaine = useMemo(() => {
    const withDate = rows.filter((r) => r.recordDate?.trim());
    if (withDate.length === 0) return 0;
    const sorted = [...withDate].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    
    // Calculate cumul for each day to get the final value
    let runningCumul = 0;
    for (const row of sorted) {
      const nbre = parseInt(row.mortaliteNbre, 10) || 0;
      runningCumul += nbre;
    }
    
    // For S2+, add previous week's ending cumul as the starting point
    if (!isFirstWeek && prevWeekEndCumulMortalite !== null) {
      return prevWeekEndCumulMortalite + runningCumul;
    }
    return runningCumul;
  }, [rows, isFirstWeek, prevWeekEndCumulMortalite]);

  /**
   * Footer TOTAL CUMUL: prefer last row's persisted `mortaliteCumul` from API when present so the table
   * matches DB-backed values; otherwise use client offset + weekly sum.
   * Should always show the final cumulative value from the last day (day 7).
   */
  const totalCumulFooterDisplay = useMemo(() => {
    const withDate = rows.filter((r) => r.recordDate?.trim());
    if (withDate.length === 0) return totalMortaliteCumulFinSemaine;
    const sorted = [...withDate].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    
    // Find the last row with a valid cumulative value (including 0)
    for (let i = sorted.length - 1; i >= 0; i--) {
      const c = sorted[i].mortaliteCumul?.trim() ?? "";
      if (c !== "") {
        const n = parseInt(c, 10);
        if (!Number.isNaN(n)) return n; // Return any valid number, including 0
      }
    }
    return totalMortaliteCumulFinSemaine;
  }, [rows, totalMortaliteCumulFinSemaine]);

  /**
   * NEW LOGIC - Computed mortality stats:
   * - Mortalité % (Journée) = (Mortalité NBRE du jour / Effectif départ de la semaine) × 100
   * - Mortalité CUMUL = sum of NBRE from day 1 to current day
   *   (For S1: starts from 0, first day's NBRE becomes the first cumul; for S2+: starts from previous week's end)
   * - Mortalité % CUMUL = (Mortalité CUMUL / Effectif départ de la semaine) × 100
   */
  const mortalityComputedByRowId = useMemo(() => {
    const effectif = effectifPourCalculMortalite;
    if (effectif == null)
      return new Map<string, { mortalitePct: string; mortaliteCumul: string; mortaliteCumulPct: string }>();

    const withDate = rows.filter((r) => r.recordDate && r.recordDate.trim() !== "");
    const sorted = [...withDate].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    const map = new Map<string, { mortalitePct: string; mortaliteCumul: string; mortaliteCumulPct: string }>();
    
    // Starting point depends on week
    const startingCumul = isFirstWeek ? 0 : (prevWeekEndCumulMortalite ?? 0);
    let runningCumul = startingCumul;

    for (const row of sorted) {
      const nbre = parseInt(row.mortaliteNbre, 10) || 0;
      runningCumul += nbre;
      const mortalitePct = ((nbre / effectif) * 100).toFixed(2);
      const mortaliteCumulPct = ((runningCumul / effectif) * 100).toFixed(2);
      map.set(row.id, {
        mortalitePct,
        mortaliteCumul: String(runningCumul),
        mortaliteCumulPct,
      });
    }
    return map;
  }, [rows, effectifPourCalculMortalite, isFirstWeek, prevWeekEndCumulMortalite]);

  /**
   * NEW LOGIC - Ligne MORTALITE DU TRANSPORT (now shows the starting point):
   * S1: First day's mortalité NBRE value (starting point for cumul calculation)
   * S2+: Previous week's ending cumul (starting point for cumul calculation)
   * % cumul = (starting point / effectif mis en place) × 100
   */
  const mortaliteTransportDisplay = useMemo(() => {
    const ef = effectifInitial;
    const cumul = mortaliteTransportStartingPoint;

    if (cumul === null || cumul === undefined) return null;

    if (ef == null || ef <= 0) {
      return {
        cumul,
        cumulPctDisplay: "—" as string,
      };
    }
    const pct = (cumul / ef) * 100;
    return {
      cumul,
      cumulPctDisplay: `${formatGroupedNumber(pct, 2).replace(".", ",")} %`,
    };
  }, [mortaliteTransportStartingPoint, effectifInitial]);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des données hebdomadaires…</span>
      </div>
    );
  }

  const showSaveCol = !effectiveReadOnly && (canCreate || canUpdate);
  const showDeleteCol = !effectiveReadOnly && (canDelete || canCreate);

  return (
    <div className="space-y-4">
      {/* Effectif départ: compact card for current semaine */}
      <div className="inline-flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Effectif départ de {semaineCanon}</label>
          <input
            type="number"
            value={effectifDepart}
            onChange={(e) => setEffectifDepart(e.target.value)}
            placeholder={effectifInitial ? String(effectifInitial) : "0"}
            min="0"
            className={`w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${effectifInputReadOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
            readOnly={effectifInputReadOnly}
          />
        </div>
        {!effectiveReadOnly && (canCreate || canUpdate) && isFirstWeek && (
          <button
            type="button"
            onClick={handleSaveEffectifDepart}
            disabled={!canSaveEffectif || savingEffectif}
            title={
              !canSaveEffectif && effectifEligibleRowCount === 0
                ? "Vous ne pouvez pas modifier l'effectif après enregistrement des lignes."
                : undefined
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingEffectif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer effectif
          </button>
        )}
        {!effectiveReadOnly && !isFirstWeek && effectifDepart && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-sm font-medium">
            <Save className="w-4 h-4" />
            Auto-enregistré
          </div>
        )}
      </div>

      {/* Main tracking table */}
      <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-display font-bold text-foreground">
              Suivi Hebdomadaire — {sex} — {semaineCanon}
            </h3>
            <p className="text-xs text-muted-foreground">
              Lot {lot}
            </p>
            {!effectiveReadOnly && (canCreate || canUpdate) && (
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Enregistrez chaque ligne avec ✓. Les rôles sans droit de mise à jour complètent les lignes
                « brouillon » (effectif seul) via la même action.
              </p>
            )}
          </div>
          {!effectiveReadOnly && canCreate && (
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

        <div className="overflow-x-auto rounded-b-lg border border-border">
          <table className="w-full min-w-[900px] text-sm border-collapse bg-card table-fixed">
            <colgroup>
              <col className="w-[100px]" />
              <col className="w-[70px]" />
              <col className="w-[72px]" />
              <col className="w-[56px]" />
              <col className="w-[56px]" />
              <col className="w-[56px]" />
              <col className="w-[84px]" />
              <col className="w-12" />
              <col className="w-12" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col style={{ width: "1%", minWidth: 140 }} />
              {showSaveCol ? <col className="w-10" /> : null}
              {showDeleteCol ? <col className="w-10" /> : null}
            </colgroup>
            <thead>
              <tr className="bg-muted/80 border-b-2 border-border">
                {SUIVI_HEBDO_PRIMARY_HEADER_GROUPS.map((g) => (
                  <th key={g.label} colSpan={g.colSpan} className={g.className}>
                    {g.label}
                  </th>
                ))}
                {showSaveCol ? (
                  <th className="w-10 border-l border-border text-center text-xs font-semibold text-foreground" title="Enregistrer la ligne">
                    ✓
                  </th>
                ) : null}
                {showDeleteCol ? <th className="w-10 border-l border-border"></th> : null}
              </tr>
              <tr className="bg-muted/60 border-b border-border">
                {SUIVI_HEBDO_EXPORT_HEADERS.map((h) => (
                  <th
                    key={h}
                    className={SUIVI_HEBDO_SUBHEADER_TH_CLASS[h]}
                    title={SUIVI_HEBDO_HEADER_TITLE[h]}
                  >
                    {SUIVI_HEBDO_SUBHEADER_LABEL[h]}
                  </th>
                ))}
                {showSaveCol ? <th className="border-l border-border"></th> : null}
                {showDeleteCol ? <th className="border-l border-border"></th> : null}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-muted/40 hover:bg-muted/50 transition-colors">
                <td
                  colSpan={suiviHebdoTransportRowLabelColSpan()}
                  className="border-r border-border px-2 py-2 text-center font-semibold text-foreground align-middle"
                >
                  MORTALITE DU TRANSPORT
                </td>
                <td className="border-r border-border px-1 py-2 text-center tabular-nums align-middle bg-amber-100/80 dark:bg-amber-950/40">
                  {mortaliteTransportDisplay == null
                    ? "—"
                    : formatGroupedNumber(mortaliteTransportDisplay.cumul, 0)}
                </td>
                <td className="border-r border-border px-1 py-2 text-center tabular-nums text-muted-foreground align-middle">
                  {mortaliteTransportDisplay == null ? "—" : mortaliteTransportDisplay.cumulPctDisplay}
                </td>
                <td className="border-r border-border px-1 py-2 align-middle" />
                <td className="border-r border-border px-1 py-2 align-middle" />
                <td className="border-r border-border px-1 py-2 align-middle" />
                <td className="border-r border-border px-1 py-2 align-middle" />
                <td className="border-r border-border px-1 py-2 align-middle" />
                <td className="border-r border-border px-1 py-2 align-middle" />
                {showSaveCol ? <td className="border-l border-border px-1 py-2" /> : null}
                {showDeleteCol ? <td className="border-l border-border px-1 py-2" /> : null}
              </tr>
              {rows.map((row, index) => {
                const saved = isSavedRow(row.id);
                const isPlaceholder = row.isPlaceholder ?? !hasMeaningfulDailyData(row);
                const readOnly = effectiveReadOnly || (saved && !canUpdate && !isPlaceholder);
                const inputBase = "w-full bg-transparent border-0 outline-none px-1 py-1 text-sm focus:ring-1 focus:ring-ring rounded " + (readOnly ? "bg-muted/40 cursor-not-allowed" : "");
                const comp = mortalityComputedByRowId.get(row.id);
                const pctJourDisplay =
                  row.mortalitePct.trim() !== ""
                    ? `${row.mortalitePct.replace(".", ",")} %`
                    : comp?.mortalitePct
                      ? `${comp.mortalitePct.replace(".", ",")} %`
                      : "—";
                const apiCumulParsed = row.mortaliteCumul.trim() === "" ? null : parseInt(row.mortaliteCumul, 10);
                const compCumulParsed = comp?.mortaliteCumul ? parseInt(comp.mortaliteCumul, 10) : null;
                /** API may return 0 from uninitialized DB columns while client running cumul is correct */
                const preferClientCumul =
                  apiCumulParsed === 0 &&
                  compCumulParsed != null &&
                  !Number.isNaN(compCumulParsed) &&
                  compCumulParsed > 0;
                const cumulDisplay =
                  row.mortaliteCumul.trim() !== "" && !preferClientCumul
                    ? formatIntCell(row.mortaliteCumul)
                    : comp?.mortaliteCumul
                      ? formatGroupedNumber(parseInt(comp.mortaliteCumul, 10) || 0, 0)
                      : "—";
                const pctCumulDisplay =
                  row.mortaliteCumulPct.trim() !== "" && !preferClientCumul
                    ? `${row.mortaliteCumulPct.replace(".", ",")} %`
                    : comp?.mortaliteCumulPct
                      ? `${comp.mortaliteCumulPct.replace(".", ",")} %`
                      : "—";
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border ${index % 2 === 0 ? "bg-card" : "bg-muted/20"} hover:bg-muted/30 transition-colors`}
                  >
                    <td className="border-r border-border align-middle px-1">
                      {readOnly ? (
                        <span className="block px-1 py-1 text-sm tabular-nums text-foreground max-w-[120px]">
                          {formatIsoDateDisplay(row.recordDate)}
                        </span>
                      ) : (
                        <input
                          type="date"
                          value={row.recordDate}
                          onChange={(e) => updateRow(row.id, "recordDate", e.target.value)}
                          className={`${inputBase} max-w-[120px]`}
                        />
                      )}
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="number"
                        value={row.ageJour}
                        onChange={(e) => updateRow(row.id, "ageJour", e.target.value)}
                        placeholder="0"
                        min="0"
                        readOnly={readOnly}
                        className={`${inputBase} w-14 text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1 min-w-[72px]">
                      <input
                        type="number"
                        value={row.mortaliteNbre}
                        onChange={(e) => updateRow(row.id, "mortaliteNbre", e.target.value)}
                        placeholder="0"
                        min="0"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[64px] text-center`}
                      />
                    </td>
                    <td className="border-r border-border text-center text-muted-foreground tabular-nums px-1 py-1 min-w-[56px]">
                      {pctJourDisplay}
                    </td>
                    <td className="border-r border-border text-center tabular-nums px-1 py-1 min-w-[56px]">
                      {cumulDisplay}
                    </td>
                    <td className="border-r border-border text-center text-muted-foreground tabular-nums px-1 py-1 min-w-[56px]">
                      {pctCumulDisplay}
                    </td>
                    <td className="border-r border-border align-middle px-1 min-w-[84px]">
                      <input
                        type="number"
                        value={row.consoEauL}
                        onChange={(e) => updateRow(row.id, "consoEauL", e.target.value)}
                        placeholder="0"
                        step="0.1"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[56px] text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1 w-12">
                      <input
                        type="number"
                        value={row.tempMin}
                        onChange={(e) => updateRow(row.id, "tempMin", e.target.value)}
                        placeholder="—"
                        step="0.1"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[2.5rem] text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1 w-12">
                      <input
                        type="number"
                        value={row.tempMax}
                        onChange={(e) => updateRow(row.id, "tempMax", e.target.value)}
                        placeholder="—"
                        step="0.1"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[2.5rem] text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="text"
                        value={row.vaccination}
                        onChange={(e) => updateRow(row.id, "vaccination", e.target.value)}
                        placeholder="—"
                        className={`${inputBase} min-w-[90px]`}
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="text"
                        value={row.traitement}
                        onChange={(e) => updateRow(row.id, "traitement", e.target.value)}
                        placeholder="—"
                        className={`${inputBase} min-w-[90px]`}
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="text"
                        value={row.observation}
                        onChange={(e) => updateRow(row.id, "observation", e.target.value)}
                        placeholder="—"
                        className={`${inputBase} min-w-[120px]`}
                        readOnly={readOnly}
                      />
                    </td>
                    {showSaveCol ? (
                      <td className="border-l border-border text-center align-middle px-0.5">
                        <button
                          type="button"
                          onClick={() => saveRow(row)}
                          disabled={readOnly || savingRowId !== null}
                          className="inline-flex items-center justify-center p-1.5 rounded-md text-primary hover:bg-primary/10 disabled:opacity-40 disabled:pointer-events-none"
                          aria-label="Enregistrer la ligne"
                          title="Enregistrer cette ligne"
                        >
                          {savingRowId === row.id ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          ) : (
                            <Check className="w-4 h-4 shrink-0" />
                          )}
                        </button>
                      </td>
                    ) : null}
                    {showDeleteCol ? (
                      <td className="border-l border-border text-center align-middle">
                        {index >= ROWS_PER_WEEK && (canDelete || !saved) ? (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="inline-flex p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                            disabled={rows.length <= ROWS_PER_WEEK}
                            aria-label="Supprimer la ligne"
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
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border">
                  TOTAL {semaineCanon}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-destructive whitespace-nowrap">
                  {formatGroupedNumber(weeklyTotals.totalMortality, 0)}
                </td>
                <td className="px-1.5 py-2 text-center text-muted-foreground border-r border-border tabular-nums whitespace-nowrap">
                  {rows.length && effectifInitial != null
                    ? `${formatGroupedNumber((weeklyTotals.totalMortality / effectifInitial) * 100, 2)} %`
                    : "—"}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums whitespace-nowrap">
                  {formatGroupedNumber(totalCumulFooterDisplay, 0)}
                </td>
                <td className="px-1.5 py-2 text-center text-muted-foreground border-r border-border tabular-nums whitespace-nowrap">
                  {effectifInitial != null && effectifInitial > 0
                    ? `${formatGroupedNumber(
                        (totalCumulFooterDisplay / effectifInitial) * 100,
                        2
                      )} %`
                    : "—"}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-muted-foreground whitespace-nowrap">
                  {`${formatGroupedNumber(weeklyTotals.totalWater, 2)} L`}
                </td>
                <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border"></td>
                {showSaveCol ? <td className="px-1.5 py-2 text-center border-l border-border"></td> : null}
                {showDeleteCol ? <td className="px-1.5 py-2 text-center border-l border-border"></td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
