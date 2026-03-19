import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Save, Calendar, Trash2, Download, FileSpreadsheet, FileText } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
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
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type LivraisonElectriciteResponse,
  type LivraisonElectriciteRequest,
  type LotWithStatusResponse,
} from "@/lib/api";
import { sortSemaines, computeAgeByRowId } from "@/utils/semaineAgeUtils";
import { getStoredSelectedFarm } from "@/lib/api";
import { exportToExcel, exportToPdf } from "@/lib/electriciteExport";

/**
 * FICHE DE SUIVI DES LIVRAISONS ÉLECTRICITÉ
 * Flow: Farm → Lot → Semaine → Table (like Suivi Technique Hebdomadaire / Livraisons Aliment).
 * Each semaine has its own table; TOTAL = current semaine, CUMUL = previous semaines + current.
 * Same permission matrix: canCreate for add/save, canUpdate for saved rows, canDelete for delete.
 * RESPONSABLE_FERME: can add and save new rows; saved rows are read-only (no update/delete).
 * Only filled lines (at least date) are created on Save, so they can save line 1 → locked; then fill and save line 2 → both locked; etc.
 * Columns: date, age (semaine), designation, fournisseur, qte, prix, montant, N°BR, male, femelle.
 */

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

interface ElectriciteRow {
  id: string;
  serverId?: number;
  date: string;
  age: string; // Legacy; SEM = semaine, AGE = computed
  sem: string;
  designation: string;
  supplier: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
  male: string;
  femelle: string;
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function fromNum(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Get SEM from row (sem or age for backward compat). */
function getSemFromRow(r: { sem?: string; age?: string }): string {
  return (r.sem || r.age || "").trim();
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

/** Ensure within each semaine, row dates are consecutive (day +1). Uses min date per group as start. */
function normalizeRowsConsecutiveDates<T extends { id: string; date: string; sem?: string; age?: string }>(
  rows: T[],
  getSemaine: (r: { sem?: string; age?: string }) => string
): T[] {
  const bySem = new Map<string, T[]>();
  for (const r of rows) {
    const sem = (getSemaine(r) || "").trim();
    if (!bySem.has(sem)) bySem.set(sem, []);
    bySem.get(sem)!.push(r);
  }
  const dateById = new Map<string, string>();
  for (const [, group] of bySem) {
    const sorted = [...group].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let d = sorted[0]?.date?.trim() || "";
    for (let i = 0; i < sorted.length; i++) {
      dateById.set(sorted[i].id, d);
      d = addOneDay(d);
    }
  }
  return rows.map((r) => ({ ...r, date: dateById.get(r.id) ?? r.date }));
}

export default function Electricite() {
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

  const { canAccessAllFarms, isReadOnly, canCreate, canUpdate, canDelete, selectedFarmId: authSelectedFarmId } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [rows, setRows] = useState<ElectriciteRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSelectedLotClosed = Boolean(lotFilter.trim() && lotsWithStatus.find((l) => l.lot === lotFilter.trim())?.closed);
  const [saving, setSaving] = useState(false);
  const [newSemaineInput, setNewSemaineInput] = useState("");
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

  const emptyRow = (sem?: string, overrideDate?: string): ElectriciteRow => ({
    id: crypto.randomUUID(),
    date: overrideDate ?? today,
    age: "",
    sem: sem ?? "",
    designation: "",
    supplier: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
    numeroBR: "",
    male: "",
    femelle: "",
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
      const list = await api.livraisonsElectricite.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: ElectriciteRow[] = list.map((r: LivraisonElectriciteResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        date: r.date ?? "",
        age: r.age ?? "",
        sem: r.sem ?? r.age ?? "", // Backward compat: old data had age=semaine
        designation: r.designation ?? "",
        supplier: r.supplier ?? "",
        qte: fromNum(r.qte),
        prixPerUnit: fromNum(r.prixPerUnit),
        montant: fromNum(r.montant),
        numeroBR: r.numeroBR ?? "",
        male: fromNum(r.male),
        femelle: fromNum(r.femelle),
      }));
      setRows(normalizeRowsConsecutiveDates(mapped, getSemFromRow));
    } catch {
      /* API error — logged in backend only */
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, toast, isSelectedLotClosed]);

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
    api.livraisonsElectricite
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
    const newRows: ElectriciteRow[] = [];
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
    const newRow = { ...emptyRow(selectedSemaine), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.livraisonsElectricite
        .delete(row.serverId)
        .then(() => loadMovements())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof ElectriciteRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "qte" || field === "prixPerUnit") {
          const qte = toNum(updated.qte);
          const prix = toNum(updated.prixPerUnit);
          if (qte >= 0 && prix >= 0) {
            updated.montant = (qte * prix).toFixed(2);
          }
        }
        return updated;
      })
    );
  };

  const ageByRowId = React.useMemo(
    () => computeAgeByRowId(rows, (r) => getSemFromRow(r), (r) => r.date),
    [rows]
  );

  const rowToRequest = (r: ElectriciteRow, computedAge?: number): LivraisonElectriciteRequest => {
    const qte = r.qte.trim() !== "" ? toNum(r.qte) : null;
    const prix = toNum(r.prixPerUnit);
    const montant = r.montant.trim() !== "" ? toNum(r.montant) : (qte != null && prix >= 0 ? qte * prix : null);
    const male = r.male.trim() !== "" ? toNum(r.male) : null;
    const femelle = r.femelle.trim() !== "" ? toNum(r.femelle) : null;
    const sem = (r.sem || "").trim() || selectedSemaine || null;
    const age = computedAge != null ? String(computedAge) : (r.age.trim() || null);
    return {
      farmId: pageFarmId ?? undefined,
      lot: lotFilter.trim() || null,
      date: r.date || today,
      age,
      sem,
      designation: r.designation.trim() || null,
      supplier: r.supplier.trim() || null,
      qte: qte ?? null,
      prixPerUnit: prix > 0 ? prix : null,
      montant: montant != null && montant >= 0 ? montant : null,
      numeroBR: r.numeroBR.trim() || null,
      male: male != null && male >= 0 ? Math.round(male) : null,
      femelle: femelle != null && femelle >= 0 ? Math.round(femelle) : null,
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
    const forSem = (r: ElectriciteRow) => getSemFromRow(r) === selectedSemaine;
    const unsavedForSem = rows
      .filter((r) => forSem(r) && r.serverId == null)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const firstUnsaved = unsavedForSem[0];

    if (!firstUnsaved || firstUnsaved.date.trim() === "") {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Remplissez la date du jour pour la prochaine ligne à enregistrer.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const computedAge = ageByRowId.get(firstUnsaved.id);
      await api.livraisonsElectricite.createBatch([rowToRequest(firstUnsaved, computedAge)], pageFarmId ?? undefined);
      toast({
        title: "Jour enregistré",
        description: `Le ${firstUnsaved.date} a été enregistré. Vous pouvez maintenant remplir le jour suivant.`,
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
  const firstEditableRowIndex = currentRows.findIndex((r) => r.serverId == null);
  const weekTotal = (() => {
    const t = { qte: 0, prix: 0, montant: 0, male: 0, femelle: 0 };
    for (const r of currentRows) {
      t.qte += toNum(r.qte);
      t.prix += toNum(r.prixPerUnit);
      t.montant += toNum(r.montant);
      t.male += toNum(r.male);
      t.femelle += toNum(r.femelle);
    }
    return t;
  })();
  const cumulForSelectedSemaine = (() => {
    const sems = new Set(rows.map(getSemFromRow).filter(Boolean));
    const semOrder = sortSemaines([...sems]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    const running = { qte: 0, prix: 0, montant: 0, male: 0, femelle: 0 };
    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => getSemFromRow(r) === sem);
      for (const r of weekRows) {
        running.qte += toNum(r.qte);
        running.prix += toNum(r.prixPerUnit);
        running.montant += toNum(r.montant);
        running.male += toNum(r.male);
        running.femelle += toNum(r.femelle);
      }
    }
    return running;
  })();

  const colCount = 12;

  const canShowExport = hasLotInUrl && hasSemaineInUrl && !isSelectedLotClosed && pageFarmId != null;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === pageFarmId)?.name ?? "Ferme")
      : (getStoredSelectedFarm()?.name ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport || !lotFilter.trim() || !selectedSemaine) return;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: lotFilter.trim(),
        semaine: selectedSemaine,
        rows: currentRows,
        weekTotal,
        cumul: cumulForSelectedSemaine,
        ageByRowId,
      });
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    if (!canShowExport || !lotFilter.trim() || !selectedSemaine) return;
    exportToPdf({
      farmName: exportFarmName,
      lot: lotFilter.trim(),
      semaine: selectedSemaine,
      rows: currentRows,
      weekTotal,
      cumul: cumulForSelectedSemaine,
      ageByRowId,
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>FICHE DE SUIVI DES LIVRAISONS ÉLECTRICITÉ</h1>
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
          Suivi des livraisons électricité par lot et semaine
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
              ? "Choisissez une ferme pour consulter les livraisons électricité."
              : "Choisissez une ferme pour consulter et gérer les livraisons électricité."}
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
            title="Choisir un lot — Livraisons Électricité"
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
            Choisissez une semaine pour consulter et gérer les livraisons électricité.
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
                  <h2 className="text-lg font-display font-bold text-foreground">
                    Livraisons électricité
                  </h2>
                  {!isReadOnly && firstEditableRowIndex >= 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Chaque ligne = un jour. Remplissez le jour affiché, cliquez Enregistrer, puis remplissez le suivant. Les jours enregistrés ne sont plus modifiables.
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
                      disabled={saving || loading || firstEditableRowIndex < 0}
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
                      <th className="min-w-[70px]" title="Âge séquentiel (1, 2, 3…)">AGE</th>
                      <th className="min-w-[100px]">DATE</th>
                      <th className="min-w-[60px]" title="Semaine (S1, S2…)">SEM</th>
                      <th className="min-w-[180px]">designation</th>
                      <th className="min-w-[120px]">fournisseur</th>
                      <th className="min-w-[70px]">qte</th>
                      <th className="min-w-[80px]">prix</th>
                      <th className="min-w-[90px]">montant</th>
                      <th className="min-w-[90px]">N°BR</th>
                      <th className="min-w-[70px]">male</th>
                      <th className="min-w-[80px]">femelle</th>
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
                          const rowReadOnly = isReadOnly || row.serverId != null || !isFirstEditable;
                          const showDelete = row.serverId != null ? canDelete : canCreate;
                          return (
                            <tr key={row.id}>
                              <td className="text-sm font-medium text-muted-foreground">
                                {ageByRowId.get(row.id) ?? "—"}
                              </td>
                              <td>
                                <input
                                  type="date"
                                  value={row.date}
                                  onChange={(e) => updateRow(row.id, "date", e.target.value)}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td className="text-sm font-medium text-muted-foreground">
                                {(row.sem || "").trim() || selectedSemaine || "—"}
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.designation}
                                  onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="min-w-[160px] bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.supplier}
                                  onChange={(e) => updateRow(row.id, "supplier", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="min-w-[100px] bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={row.qte}
                                  onChange={(e) => updateRow(row.id, "qte", e.target.value)}
                                  placeholder="—"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={row.prixPerUnit}
                                  onChange={(e) => updateRow(row.id, "prixPerUnit", e.target.value)}
                                  placeholder="—"
                                  step="0.01"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td className="font-semibold text-sm">{row.montant || "—"}</td>
                              <td>
                                <input
                                  type="text"
                                  value={row.numeroBR}
                                  onChange={(e) => updateRow(row.id, "numeroBR", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={row.male}
                                  onChange={(e) => updateRow(row.id, "male", e.target.value)}
                                  placeholder="0"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={row.femelle}
                                  onChange={(e) => updateRow(row.id, "femelle", e.target.value)}
                                  placeholder="0"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
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
                        {currentRows.length > 0 && (
                          <>
                            <tr className="bg-muted/60">
                              <td colSpan={5} className="text-sm font-medium text-muted-foreground">
                                TOTAL {selectedSemaine}
                              </td>
                              <td>{weekTotal.qte}</td>
                              <td>{weekTotal.prix.toFixed(2)}</td>
                              <td>{weekTotal.montant.toFixed(2)}</td>
                              <td>—</td>
                              <td>{weekTotal.male}</td>
                              <td>{weekTotal.femelle}</td>
                              <td></td>
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={5} className="text-sm font-medium text-muted-foreground">
                                CUMUL
                              </td>
                              <td>{cumulForSelectedSemaine.qte}</td>
                              <td>{cumulForSelectedSemaine.prix.toFixed(2)}</td>
                              <td>{cumulForSelectedSemaine.montant.toFixed(2)}</td>
                              <td>—</td>
                              <td>{cumulForSelectedSemaine.male}</td>
                              <td>{cumulForSelectedSemaine.femelle}</td>
                              <td></td>
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
