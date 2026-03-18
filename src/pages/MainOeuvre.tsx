import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Check, Download, FileSpreadsheet, FileText, Loader2, Plus, Save, Trash2, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type EmployerResponse,
  type MainOeuvreResponse,
  type MainOeuvreRequest,
  type LotWithStatusResponse,
  getStoredSelectedFarm,
} from "@/lib/api";
import { exportToExcel, exportToPdf } from "@/lib/mainOeuvreExport";
import { sortSemaines, computeAgeByRowId } from "@/utils/semaineAgeUtils";

/**
 * MAIN D'ŒUVRE
 * Flow: Farm → Lot → Semaine → Table (like Suivi Technique Hebdomadaire / Livraisons Aliment).
 * Each semaine has its own table; TOTAL = jours for current semaine, CUMUL = running jours.
 * Table: Date, Semaine (age), Employé, Temps (1 jour or 1/2 demijour). Permissions: canCreate/canUpdate/canDelete.
 * RESPONSABLE_FERME: can add and save new rows; saved rows are read-only (no update/delete).
 * Only filled lines (date + employé) are created on Save, so they can save line 1 → locked; then fill and save line 2 → both locked; etc.
 */

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

interface EmployerEntry {
  id: string;
  serverId?: number;
  employerId: number;
  employerNom: string;
  employerPrenom: string;
  fullDay: boolean;
}

interface MainOeuvreRow {
  id: string;
  date: string;
  age: string; // Legacy; SEM = semaine, AGE = computed
  sem: string;
  entries: EmployerEntry[]; // Multiple employees per date
  observation: string;
}

/** Get SEM from row (sem or age for backward compat). */
function getSemFromRow(r: { sem?: string; age?: string }): string {
  return (r.sem || r.age || "").trim();
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Affiche le nom complet : Prénom Nom */
function formatEmployerNomComplet(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p && !n) return "—";
  return p && n ? `${p} ${n}` : p || n;
}

/** Initiales pour avatar : première lettre prenom + nom (ex. JD) */
function getEmployerInitials(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  const firstP = p.charAt(0).toUpperCase();
  const firstN = n.charAt(0).toUpperCase();
  if (firstP && firstN) return `${firstP}${firstN}`;
  return firstP || firstN || "?";
}

function formatTemps(fullDay: boolean | null | undefined): string {
  return fullDay === true ? "1" : fullDay === false ? "1/2" : "—";
}

/** Jours for one entry: 1 if fullDay, 0.5 otherwise */
function entryJours(fullDay: boolean): number {
  return fullDay ? 1 : 0.5;
}

/** Total jours for a row = sum of all entries */
function rowTotalJours(entries: EmployerEntry[]): number {
  return entries.reduce((s, e) => s + entryJours(e.fullDay), 0);
}

/** Sort lots: Lot1, Lot2, ... (natural order). */
function sortLots(lotList: string[]): string[] {
  return [...lotList].sort((a, b) => {
    const numA = parseInt(a.replace(/^.*?(\d+)$/i, "$1"), 10);
    const numB = parseInt(b.replace(/^.*?(\d+)$/i, "$1"), 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    if (!Number.isNaN(numA)) return -1;
    if (!Number.isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
}

export default function MainOeuvre() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const semaineParam = searchParams.get("semaine") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);
  const hasLotInUrl = lotParam.trim() !== "";
  const trimmedSemaine = semaineParam.trim();
  const hasSemaineInUrl = trimmedSemaine !== "";
  const selectedSemaine = trimmedSemaine;

  const { canAccessAllFarms, isReadOnly, canCreate, canUpdate, canDelete, selectedFarmId: authSelectedFarmId, isAdministrateur, isResponsableTechnique, isBackofficeEmployer } = useAuth();
  const showMontantColumn = isAdministrateur || isResponsableTechnique || isBackofficeEmployer;
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [employers, setEmployers] = useState<EmployerResponse[]>([]);
  const [employersLoading, setEmployersLoading] = useState(false);
  const [rows, setRows] = useState<MainOeuvreRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSelectedLotClosed = Boolean(lotParam.trim() && lotsWithStatus.find((l) => l.lot === lotParam.trim())?.closed);
  const [saving, setSaving] = useState(false);
  const [newSemaineInput, setNewSemaineInput] = useState("");
  const [addingToRowId, setAddingToRowId] = useState<string | null>(null);
  const [addingEmployerId, setAddingEmployerId] = useState<number | null>(null);
  const [addingFullDay, setAddingFullDay] = useState(true);
  const [previousLotLastDate, setPreviousLotLastDate] = useState<string | null>(null);
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!showFarmSelector) return;
    setFarmsLoading(true);
    api.farms
      .list()
      .then((list) => setFarms(list))
      .catch(() => setFarms([]))
      .finally(() => setFarmsLoading(false));
  }, [showFarmSelector]);

  useEffect(() => {
    if (showFarmSelector || !pageFarmId) return;
    setLotsLoading(true);
    api.farms
      .lotsWithStatus(pageFarmId)
      .then((data) => {
        setLotsWithStatus(data ?? []);
        setLots((data ?? []).map((x) => x.lot));
      })
      .catch(() => { setLotsWithStatus([]); setLots([]); })
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, pageFarmId]);

  useEffect(() => {
    if (showFarmSelector) return;
    setEmployersLoading(true);
    api.employers
      .list()
      .then((list) => setEmployers(list))
      .catch(() => setEmployers([]))
      .finally(() => setEmployersLoading(false));
  }, [showFarmSelector]);

  const selectFarm = useCallback(
    (id: number) => setSearchParams({ farmId: String(id) }),
    [setSearchParams]
  );
  const clearFarmSelection = useCallback(() => setSearchParams({}), [setSearchParams]);

  const clearSemaineSelection = useCallback(() => {
    const next: Record<string, string> = {};
    if (selectedFarmId != null) next.farmId = String(selectedFarmId);
    if (lotFilter.trim()) next.lot = lotFilter.trim();
    setSearchParams(next);
  }, [selectedFarmId, lotFilter, setSearchParams]);

  const selectSemaine = useCallback(
    (semaine: string) => {
      const next: Record<string, string> = {};
      if (selectedFarmId != null) next.farmId = String(selectedFarmId);
      if (lotFilter.trim()) next.lot = lotFilter.trim();
      next.semaine = semaine;
      setSearchParams(next);
    },
    [selectedFarmId, lotFilter, setSearchParams]
  );

  const emptyRow = (age?: string, overrideDate?: string): MainOeuvreRow => ({
    id: crypto.randomUUID(),
    date: overrideDate ?? today,
    age: age ?? "",
    sem: age ?? "",
    entries: [],
    observation: "",
  });

  /** Start date for a semaine: S2 = last day of S1 + 1; first semaine of lot = previous lot last day + 1 (or today). */
  const getStartDateForSemaine = useCallback(
    (semaine: string): string => {
      const sems = new Set(rows.map(getSemFromRow).filter(Boolean));
      sems.add(semaine.trim());
      const semOrder = sortSemaines([...sems]);
      const idx = semOrder.indexOf(semaine.trim());
      if (idx < 0) return today;
      if (idx === 0) return previousLotLastDate ?? today;
      const prevSem = semOrder[idx - 1];
      const prevRows = rows.filter((r) => getSemFromRow(r) === prevSem);
      if (prevRows.length === 0) return today;
      const dates = prevRows.map((r) => r.date).filter((d) => d?.trim());
      if (dates.length === 0) return today;
      const maxD = dates.sort()[dates.length - 1];
      return maxD ? addOneDay(maxD) : today;
    },
    [rows, previousLotLastDate]
  );

  const loadMovements = useCallback(async () => {
    if (showFarmSelector || !lotFilter.trim() || isSelectedLotClosed) return;
    setLoading(true);
    try {
      const list = await api.mainOeuvre.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      // Group by (date, sem) — each group becomes one row with multiple entries
      const byKey = new Map<string, MainOeuvreResponse[]>();
      for (const r of list) {
        const date = r.date ?? today;
        const sem = (r.sem ?? r.age ?? "").trim();
        const key = `${date}|${sem}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(r);
      }
      const mapped: MainOeuvreRow[] = Array.from(byKey.entries()).map(([key, recs]) => {
        const [datePart, semPart] = key.split("|");
        const first = recs[0]!;
        const entries: EmployerEntry[] = recs.map((r) => ({
          id: crypto.randomUUID(),
          serverId: r.id,
          employerId: r.employerId ?? 0,
          employerNom: r.employerNom ?? "",
          employerPrenom: r.employerPrenom ?? "",
          fullDay: r.fullDay ?? true,
        }));
        return {
          id: crypto.randomUUID(),
          date: datePart,
          age: first.age ?? semPart,
          sem: semPart,
          entries,
          observation: first.observation ?? "",
        };
      });
      setRows(mapped);
    } catch {
      /* API error — logged in backend only */
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, today, isSelectedLotClosed]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    if (!lotFilter.trim() || !pageFarmId || lots.length === 0) {
      setPreviousLotLastDate(null);
      return;
    }
    const ordered = sortLots(lots);
    const currentIndex = ordered.indexOf(lotFilter.trim());
    if (currentIndex <= 0) {
      setPreviousLotLastDate(null);
      return;
    }
    const previousLot = ordered[currentIndex - 1];
    api.mainOeuvre
      .list({ farmId: pageFarmId, lot: previousLot })
      .then((list) => {
        if (list.length === 0) {
          setPreviousLotLastDate(null);
          return;
        }
        const dates = list.map((r) => r.date).filter((d): d is string => !!d && d.trim() !== "");
        if (dates.length === 0) {
          setPreviousLotLastDate(null);
          return;
        }
        const maxDate = dates.sort()[dates.length - 1];
        setPreviousLotLastDate(addOneDay(maxDate));
      })
      .catch(() => setPreviousLotLastDate(null));
  }, [lotFilter, pageFarmId, lots]);

  useEffect(() => {
    setLotFilter(lotParam);
  }, [lotParam]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedFarmId != null) params.farmId = String(selectedFarmId);
    if (lotFilter.trim()) params.lot = lotFilter.trim();
    if (hasSemaineInUrl && trimmedSemaine) params.semaine = trimmedSemaine;
    setSearchParams(params, { replace: true });
  }, [selectedFarmId, lotFilter, hasSemaineInUrl, trimmedSemaine, setSearchParams]);

  useEffect(() => {
    if (!hasSemaineInUrl || !selectedSemaine) return;
    const forSem = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    if (forSem.length >= MIN_TABLE_ROWS) return;
    const toAdd = MIN_TABLE_ROWS - forSem.length;
    const startDate =
      forSem.length > 0
        ? (() => {
            const dates = forSem.map((r) => r.date).filter((d) => d?.trim());
            if (dates.length === 0) return getStartDateForSemaine(selectedSemaine);
            const maxD = dates.sort()[dates.length - 1];
            return addOneDay(maxD);
          })()
        : getStartDateForSemaine(selectedSemaine);
    const newRows: MainOeuvreRow[] = [];
    let nextDate = startDate;
    for (let i = 0; i < toAdd; i++) {
      newRows.push(emptyRow(selectedSemaine, nextDate));
      nextDate = addOneDay(nextDate);
    }
    setRows((prev) => [...prev, ...newRows]);
  }, [hasSemaineInUrl, selectedSemaine, rows.length, getStartDateForSemaine]);

  const addRow = () => {
    if (!canCreate || !selectedSemaine) return;
    const currentRows = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    const lastRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
    const nextDate =
      lastRow?.date?.trim() ? addOneDay(lastRow.date) : getStartDateForSemaine(selectedSemaine);
    const newRow: MainOeuvreRow = { ...emptyRow(selectedSemaine), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const savedEntryIds = row.entries.filter((e) => e.serverId != null).map((e) => e.serverId!);
    if (savedEntryIds.length > 0 && !canDelete) return;
    if (savedEntryIds.length > 0) {
      Promise.all(savedEntryIds.map((sid) => api.mainOeuvre.delete(sid)))
        .then(() => loadMovements())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: "date" | "observation", value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id !== id ? r : { ...r, [field]: value }))
    );
  };

  const addEntry = (rowId: string, employerId: number, fullDay: boolean) => {
    const emp = employers.find((e) => e.id === employerId);
    if (!emp) return;
    const entry: EmployerEntry = {
      id: crypto.randomUUID(),
      employerId: emp.id,
      employerNom: emp.nom ?? "",
      employerPrenom: emp.prenom ?? "",
      fullDay,
    };
    setRows((prev) =>
      prev.map((r) =>
        r.id !== rowId ? r : { ...r, entries: [...r.entries, entry] }
      )
    );
    setAddingToRowId(null);
    setAddingEmployerId(null);
    setAddingFullDay(true);
  };

  const removeEntry = (rowId: string, entryId: string) => {
    const row = rows.find((r) => r.id === rowId);
    const entry = row?.entries.find((e) => e.id === entryId);
    if (entry?.serverId != null && !canDelete) return;
    if (entry?.serverId != null) {
      api.mainOeuvre
        .delete(entry.serverId)
        .then(() => loadMovements())
        .catch(() => { /* API error */ });
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id !== rowId
          ? r
          : { ...r, entries: r.entries.filter((e) => e.id !== entryId) }
      )
    );
  };

  const ageByRowId = React.useMemo(
    () => computeAgeByRowId(rows, getSemFromRow, (r) => r.date),
    [rows]
  );

  const entryToRequest = (
    r: MainOeuvreRow,
    e: EmployerEntry,
    computedAge?: number
  ): MainOeuvreRequest => {
    const emp = employers.find((x) => x.id === e.employerId);
    const salaire = emp?.salaire != null ? Number(emp.salaire) : 0;
    const jours = entryJours(e.fullDay);
    const montant = Math.round(salaire * jours * 100) / 100;
    return {
      farmId: pageFarmId ?? undefined,
      lot: lotFilter.trim() || null,
      date: r.date || today,
      age: computedAge != null ? String(computedAge) : undefined,
      sem: getSemFromRow(r) || undefined,
      employerId: e.employerId,
      fullDay: e.fullDay,
      montant,
      observation: r.observation?.trim() || undefined,
    };
  };

  const handleSave = async () => {
    if (!canCreate) {
      toast({
        title: "Non autorisé",
        description: "Vous ne pouvez pas enregistrer les données.",
        variant: "destructive",
      });
      return;
    }
    if (!lotFilter.trim() || !selectedSemaine) {
      toast({
        title: "Lot et semaine requis",
        description: "Indiquez le lot et la semaine avant d'enregistrer.",
        variant: "destructive",
      });
      return;
    }
    const forSem = (r: MainOeuvreRow) => getSemFromRow(r) === selectedSemaine;
    const rowsForSem = rows.filter(forSem).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const firstWithUnsaved = rowsForSem.find((r) =>
      r.entries.some((e) => e.serverId == null)
    );
    const unsavedEntries = firstWithUnsaved?.entries.filter((e) => e.serverId == null) ?? [];

    if (!firstWithUnsaved || firstWithUnsaved.date.trim() === "" || unsavedEntries.length === 0) {
      toast({
        title: "Aucune donnée à enregistrer",
        description: "Ajoutez au moins un employé (employé + temps + Confirmer) pour le jour à enregistrer.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const computedAge = ageByRowId.get(firstWithUnsaved.id);
      const requests = unsavedEntries.map((e) =>
        entryToRequest(firstWithUnsaved, e, computedAge)
      );
      await api.mainOeuvre.createBatch(requests, pageFarmId ?? undefined);
      toast({
        title: "Jour enregistré",
        description: `Le ${firstWithUnsaved.date} a été enregistré avec ${unsavedEntries.length} employé(s).`,
      });
      loadMovements();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setSaving(false);
    }
  };

  const currentRows = selectedSemaine
    ? [...rows.filter((r) => getSemFromRow(r) === selectedSemaine)].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];
  const firstEditableRowIndex = currentRows.findIndex((r) =>
    r.entries.length === 0 || r.entries.some((e) => e.serverId == null)
  );
  const weekTotalJours = currentRows.reduce((sum, r) => sum + rowTotalJours(r.entries), 0);
  const rowMontant = (r: MainOeuvreRow) =>
    r.entries.reduce((sum, e) => {
      const emp = employers.find((x) => x.id === e.employerId);
      const sal = emp?.salaire != null ? Number(emp.salaire) : 0;
      return sum + sal * entryJours(e.fullDay);
    }, 0);
  const cumulJours = (() => {
    const sems = new Set(rows.map(getSemFromRow).filter(Boolean));
    const semOrder = sortSemaines([...sems]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    return semsUpTo.reduce(
      (sum, sem) =>
        sum + rows.filter((r) => getSemFromRow(r) === sem).reduce((s, r) => s + rowTotalJours(r.entries), 0),
      0
    );
  })();
  const cumulMontant = (() => {
    const sems = new Set(rows.map(getSemFromRow).filter(Boolean));
    const semOrder = sortSemaines([...sems]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    return semsUpTo.reduce(
      (sum, sem) =>
        sum + rows.filter((r) => getSemFromRow(r) === sem).reduce((s, r) => s + rowMontant(r), 0),
      0
    );
  })();

  const colCount = showMontantColumn ? 8 : 7; // AGE, date, semaine, employé, temps, [montant], observation, actions

  const canShowExport = pageFarmId != null && hasLotInUrl && hasSemaineInUrl && !isSelectedLotClosed && !showFarmSelector;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === pageFarmId)?.name ?? "Ferme")
      : (getStoredSelectedFarm()?.name ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport) return;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: lotParam,
        semaine: selectedSemaine,
        rows: currentRows.map((r) => ({
          id: r.id,
          date: r.date,
          sem: getSemFromRow(r),
          entries: r.entries.map((e) => ({
            employerId: e.employerId,
            employerNom: e.employerNom,
            employerPrenom: e.employerPrenom,
            fullDay: e.fullDay,
          })),
          observation: r.observation,
        })),
        employers,
        ageByRowId,
        weekTotalJours,
        cumulJours,
        weekTotalMontant: currentRows.reduce((sum, r) => sum + rowMontant(r), 0),
        cumulMontant,
        showMontantColumn,
      });
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    if (!canShowExport) return;
    exportToPdf({
      farmName: exportFarmName,
      lot: lotParam,
      semaine: selectedSemaine,
      rows: currentRows.map((r) => ({
        id: r.id,
        date: r.date,
        sem: getSemFromRow(r),
        entries: r.entries.map((e) => ({
          employerId: e.employerId,
          employerNom: e.employerNom,
          employerPrenom: e.employerPrenom,
          fullDay: e.fullDay,
        })),
        observation: r.observation,
      })),
      employers,
      ageByRowId,
      weekTotalJours,
      cumulJours,
      weekTotalMontant: currentRows.reduce((sum, r) => sum + rowMontant(r), 0),
      cumulMontant,
      showMontantColumn,
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>Main d&apos;œuvre</h1>
          {canShowExport && (
            <TooltipProvider>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <ShimmerButton
                        type="button"
                        className="h-9 w-9 shrink-0 p-0 [border-radius:9999px] border-primary/40 text-primary"
                        background="#f1f5f9"
                        shimmerColor="rgba(37,99,235,0.3)"
                        shimmerDuration="2.5s"
                        aria-label="Télécharger Excel ou PDF"
                      >
                        <Download className="h-4 w-4 text-primary" />
                      </ShimmerButton>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="font-medium">
                    Télécharger (Excel ou PDF)
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Télécharger Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf} className="cursor-pointer gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    Télécharger PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          )}
        </div>
        <p>
          Date, employé et temps de travail (1 jour ou 1/2 demijour)
          {isReadOnly && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Consultation seule
            </span>
          )}
        </p>
      </div>

      {showFarmSelector ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {isReadOnly
              ? "Choisissez une ferme pour consulter la main d'œuvre."
              : "Choisissez une ferme pour consulter et gérer la main d'œuvre."}
          </p>
          {farmsLoading ? (
            <div className="bg-card rounded-lg border border-border shadow-sm p-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Chargement des fermes…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => selectFarm(farm.id)}
                  className="flex items-center gap-4 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground truncate">{farm.name}</div>
                    <div className="text-xs text-muted-foreground">{farm.code}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {farms.length === 0 && !farmsLoading && (
            <p className="text-sm text-muted-foreground">Aucune ferme disponible.</p>
          )}
        </div>
      ) : pageFarmId == null ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground mb-2">Aucune ferme sélectionnée.</p>
          <p className="text-sm text-muted-foreground">
            Reconnectez-vous et choisissez une ferme pour accéder à la main d&apos;œuvre.
          </p>
        </div>
      ) : !hasLotInUrl || isSelectedLotClosed ? (
        <>
          {canAccessAllFarms && isValidFarmId && (
            <button
              type="button"
              onClick={clearFarmSelection}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer de ferme
            </button>
          )}
          {isSelectedLotClosed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4 mb-6">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Ce lot est fermé. Les données ne sont pas accessibles.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Choisissez un autre lot ci-dessous.
              </p>
            </div>
          )}
          <LotSelectorView
            existingLots={lots}
            lotsWithStatus={lotsWithStatus.length > 0 ? lotsWithStatus : undefined}
            loading={lotsLoading}
            onSelectLot={(lot) => {
              const status = lotsWithStatus.find((l) => l.lot === lot);
              if (status?.closed) {
                toast({
                  title: "Lot fermé",
                  description: "Les données de ce lot ne sont pas accessibles. Choisissez un lot ouvert.",
                  variant: "destructive",
                });
                return;
              }
              setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId), lot } : { lot });
            }}
            onNewLot={(lot) => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId), lot } : { lot })}
            canCreate={canCreate}
            title="Choisir un lot — Main d'œuvre"
          />
        </>
      ) : !hasSemaineInUrl ? (
        <div className="space-y-6">
          {canAccessAllFarms && isValidFarmId && (
            <button
              type="button"
              onClick={clearFarmSelection}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer de ferme
            </button>
          )}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
            <button
              type="button"
              onClick={() => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId) } : {})}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Changer de lot
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Choisissez une semaine pour consulter et gérer la main d&apos;œuvre.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
            {SEMAINES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => selectSemaine(s)}
                className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
              >
                <Calendar className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="font-semibold text-foreground">{s}</span>
              </button>
            ))}
          </div>
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium text-foreground mb-2">Ou ajouter une nouvelle semaine</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newSemaineInput}
                onChange={(e) => setNewSemaineInput(e.target.value)}
                placeholder="ex. S25, S26..."
                className="rounded-md border border-input bg-background px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => {
                  const value = newSemaineInput.trim();
                  if (value) {
                    selectSemaine(value);
                    setNewSemaineInput("");
                  }
                }}
                disabled={!newSemaineInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {canAccessAllFarms && isValidFarmId && (
            <button
              type="button"
              onClick={clearFarmSelection}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer de ferme
            </button>
          )}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
            <button
              type="button"
              onClick={() => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId) } : {})}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Changer de lot
            </button>
            <span className="text-muted-foreground">|</span>
            <span className="text-sm font-medium">Semaine : <strong>{selectedSemaine}</strong></span>
            <button
              type="button"
              onClick={clearSemaineSelection}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Changer de semaine
            </button>
          </div>

          <div className="space-y-6 w-full min-w-0">
            <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">Main d&apos;œuvre</h2>
                  {!isReadOnly && firstEditableRowIndex >= 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Chaque ligne = un jour. Cliquez « Ajouter » pour choisir un employé et son temps de travail, puis « Confirmer ». Vous pouvez ajouter plusieurs employés par jour. Le montant est la somme de tous les employés. Cliquez « Enregistrer » quand vous avez terminé.
                    </p>
                  )}
                </div>
                {(canCreate || canUpdate) && (
                  <div className="flex gap-2">
                    {canCreate && (
                      <button
                        type="button"
                        onClick={addRow}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        <Plus className="w-4 h-4" /> Ligne
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || loading || !currentRows.some((r) => r.entries.some((e) => e.serverId == null))}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="table-farm">
                  <thead>
                    <tr>
                      <th className="min-w-[100px]" title="Âge séquentiel (1, 2, 3…)">AGE</th>
                      <th className="min-w-[120px]">Date</th>
                      <th className="min-w-[70px]">Semaine</th>
                      <th className="min-w-[320px]">Employé (nom complet)</th>
                      <th className="min-w-[140px]">Temps de travail</th>
                      {showMontantColumn && <th className="min-w-[100px]">Montant</th>}
                      <th className="min-w-[180px]">Observation</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={colCount} className="p-8 text-center text-muted-foreground">
                          Chargement…
                        </td>
                      </tr>
                    ) : (
                      <>
                        {currentRows.map((row, rowIndex) => {
                          const isFirstEditable = firstEditableRowIndex >= 0 && rowIndex === firstEditableRowIndex;
                          const hasSavedEntries = row.entries.some((e) => e.serverId != null);
                          const rowReadOnly = isReadOnly || (hasSavedEntries && !row.entries.some((e) => e.serverId == null)) || !isFirstEditable;
                          const canEditThisRow = isFirstEditable && !isReadOnly;
                          const showDelete = hasSavedEntries ? canDelete : canCreate;
                          const isAdding = addingToRowId === row.id;
                          const montantRow = rowMontant(row);
                          return (
                            <tr key={row.id}>
                              <td className="text-sm tabular-nums">
                                {ageByRowId.get(row.id) ?? "—"}
                              </td>
                              <td>
                                <input
                                  type="date"
                                  value={row.date}
                                  onChange={(e) => updateRow(row.id, "date", e.target.value)}
                                  disabled={rowReadOnly}
                                  className="bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td className="text-sm">
                                {getSemFromRow(row) || "—"}
                              </td>
                              <td>
                                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto min-w-0">
                                  {row.entries.map((entry) => {
                                    const initials = getEmployerInitials(entry.employerPrenom, entry.employerNom);
                                    const fullName = formatEmployerNomComplet(entry.employerPrenom, entry.employerNom);
                                    const tempsLabel = formatTemps(entry.fullDay);
                                    return (
                                      <div
                                        key={entry.id}
                                        className="flex items-center gap-1.5 group"
                                        title={`${fullName} — ${tempsLabel}`}
                                      >
                                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
                                          {initials}
                                        </span>
                                        {canEditThisRow && entry.serverId == null && (
                                          <button
                                            type="button"
                                            onClick={() => removeEntry(row.id, entry.id)}
                                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5"
                                            title="Retirer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {canEditThisRow && (
                                    <>
                                      {isAdding ? (
                                        <div className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2 bg-muted/30">
                                          <select
                                            value={addingEmployerId ?? ""}
                                            onChange={(e) => setAddingEmployerId(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                                            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm w-40"
                                          >
                                            <option value="">— Employé —</option>
                                            {employers.map((emp) => (
                                              <option key={emp.id} value={emp.id}>
                                                {formatEmployerNomComplet(emp.prenom, emp.nom)}
                                              </option>
                                            ))}
                                            {employers.length === 0 && !employersLoading && (
                                              <option value="" disabled>Aucun employé</option>
                                            )}
                                          </select>
                                          <select
                                            value={addingFullDay ? "1" : "0.5"}
                                            onChange={(e) => setAddingFullDay(e.target.value === "1")}
                                            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm w-24"
                                          >
                                            <option value="1">1 (jour)</option>
                                            <option value="0.5">1/2 (demijour)</option>
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => addingEmployerId != null && addEntry(row.id, addingEmployerId, addingFullDay)}
                                            disabled={addingEmployerId == null}
                                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
                                          >
                                            <Check className="w-4 h-4" /> Confirmer
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { setAddingToRowId(null); setAddingEmployerId(null); }}
                                            className="p-1 text-muted-foreground hover:text-foreground"
                                          >
                                            Annuler
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setAddingToRowId(row.id)}
                                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/10 transition-colors"
                                          title="Ajouter un employé"
                                        >
                                          <UserPlus className="w-4 h-4" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {row.entries.length === 0 && rowReadOnly && <span className="text-sm text-muted-foreground">—</span>}
                                </div>
                              </td>
                              <td>
                                {row.entries.length > 0 ? (
                                  <span className="text-sm tabular-nums">
                                    {rowTotalJours(row.entries)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </td>
                              {showMontantColumn && (
                                <td className="text-sm tabular-nums">
                                  {row.entries.length > 0 ? montantRow.toFixed(2) : "—"}
                                </td>
                              )}
                              <td>
                                {rowReadOnly ? (
                                  <span className="text-sm">{row.observation || "—"}</span>
                                ) : (
                                  <input
                                    type="text"
                                    value={row.observation}
                                    onChange={(e) => updateRow(row.id, "observation", e.target.value)}
                                    placeholder="Observation"
                                    className="w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                )}
                              </td>
                              <td>
                                {showDelete && (
                                  <button
                                    type="button"
                                    onClick={() => removeRow(row.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                    disabled={currentRows.length <= MIN_TABLE_ROWS}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {currentRows.length === 0 && !loading && (
                          <tr>
                            <td colSpan={colCount} className="p-8 text-center text-muted-foreground">
                              Aucune entrée. {canCreate && "Ajoutez une ligne pour commencer."}
                            </td>
                          </tr>
                        )}
                        {currentRows.length > 0 && (
                          <>
                            <tr className="bg-muted/60">
                              <td colSpan={3} className="text-sm font-medium text-muted-foreground">
                                TOTAL {selectedSemaine} (jours)
                              </td>
                              <td>—</td>
                              <td className="font-semibold text-sm">{weekTotalJours}</td>
                              {showMontantColumn && (
                                <td className="font-semibold text-sm tabular-nums">
                                  {currentRows.reduce((sum, r) => sum + rowMontant(r), 0).toFixed(2)}
                                </td>
                              )}
                              <td colSpan={2}></td>
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={3} className="text-sm font-medium text-muted-foreground">
                                CUMUL (jours)
                              </td>
                              <td>—</td>
                              <td className="font-semibold text-sm">{cumulJours}</td>
                              {showMontantColumn && (
                                <td className="font-semibold text-sm tabular-nums">{cumulMontant.toFixed(2)}</td>
                              )}
                              <td colSpan={2}></td>
                            </tr>
                          </>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
