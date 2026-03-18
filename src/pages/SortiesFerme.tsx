import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Loader2, Plus, Save, Tag, Trash2, Download, FileSpreadsheet, FileText } from "lucide-react";
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
import { api, type FarmResponse, type SortieRequest, type SortieResponse, type LotWithStatusResponse, getStoredSelectedFarm } from "@/lib/api";
import { exportToExcel, exportToPdf } from "@/lib/sortiesFermeExport";

/**
 * Permission matrix (same as Reporting Journalier):
 * - ADMINISTRATEUR / RESPONSABLE_TECHNIQUE: Ligne + Enregistrer visible; can edit/delete any row.
 * - BACKOFFICE_EMPLOYER: No Ligne, no Enregistrer; all rows read-only; no delete (isReadOnly, !canCreate, !canUpdate, !canDelete).
 * - RESPONSABLE_FERME: Ligne + Enregistrer visible; saved rows read-only; no delete on saved rows (canCreate, !canUpdate, !canDelete).
 * DAY-BY-DAY FLOW: Each row = one day. User fills day 1 → Enregistrer → locked; then day 2 → Enregistrer → locked.
 * Only the first unsaved row is editable (for RESPONSABLE_FERME). ADMINISTRATEUR and RESPONSABLE_TECHNIQUE can edit saved rows and update them.
 * Buttons: Ligne & Enregistrer only when canCreate. Delete on row: when saved → canDelete; when new → canCreate.
 */

const TYPES = [
  "Divers",
  "Consommation Employés (kg)",
  "Gratuite (kg)",
  "Vente Dinde Vive",
  "Vente Aliment",
  "Fumier",
];

/** Désignation options when type is Consommation Employés, Gratuite, or Vente Dinde Vive */
const DESIGNATION_OPTIONS = ["male", "femelle", "Déclassé male", "Déclassée Femelle"];

const TYPES_WITH_DESIGNATION_DROPDOWN = [
  "Consommation Employés (kg)",
  "Gratuite (kg)",
  "Vente Dinde Vive",
];

const TYPES_WITHOUT_NBRE_DINDE = [
  "Vente Aliment",
  "Fumier",
  "Divers",
];

function typeUsesDesignationDropdown(type: string): boolean {
  return TYPES_WITH_DESIGNATION_DROPDOWN.includes(type);
}

function typeDisablesNbreDinde(type: string): boolean {
  return TYPES_WITHOUT_NBRE_DINDE.includes(type);
}

/** Convert string to number, handling commas and empty values */
function toNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

/** Semaine selector options (S1..S24), like LivraisonGaz */
const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);

/** Minimum table rows to display (7 default rows for sequential save workflow) */
const MIN_TABLE_ROWS = 7;

/** Parse "S1" or "1" to number for API */
function parseSemaineToNum(s: string): number | null {
  if (s == null || s.trim() === "") return null;
  const m = s.trim().match(/^S?(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(s.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/** Add one day to a YYYY-MM-DD date string. */
function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Compare two rows for equality (saved fields only). */
function rowDataEqual(a: SortieRow, b: SortieRow): boolean {
  return (
    a.date === b.date &&
    a.lot === b.lot &&
    a.client === b.client &&
    a.num_bl === b.num_bl &&
    a.type === b.type &&
    a.designation === b.designation &&
    a.nbre_dinde === b.nbre_dinde &&
    a.qte_brute_kg === b.qte_brute_kg &&
    a.prix_kg === b.prix_kg
  );
}

interface SortieRow {
  id: string;
  /** Set when row is loaded from API (saved); used for readOnly and delete permission */
  serverId?: number;
  semaine: string;
  date: string;
  lot: string;
  client: string;
  num_bl: string;
  type: string;
  designation: string;
  nbre_dinde: string;
  qte_brute_kg: string;
  prix_kg: string;
  montant_ttc: string;
}

export default function SortiesFerme() {
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

  const {
    isAdministrateur,
    isResponsableTechnique,
    isBackofficeEmployer,
    canAccessAllFarms,
    isReadOnly,
    canCreate,
    canUpdate,
    canDelete,
    selectedFarmId: authSelectedFarmId,
  } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [rows, setRows] = useState<SortieRow[]>([]);
  const isSelectedLotClosed = Boolean(lotParam.trim() && lotsWithStatus.find((l) => l.lot === lotParam.trim())?.closed);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSemaineInput, setNewSemaineInput] = useState("");
  const originalSavedRowsRef = useRef<Map<number, SortieRow>>(new Map());
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
    if (lotParam.trim()) next.lot = lotParam.trim();
    setSearchParams(next);
  }, [selectedFarmId, lotParam, setSearchParams]);

  const selectSemaine = useCallback(
    (semaine: string) => {
      const next: Record<string, string> = {};
      if (selectedFarmId != null) next.farmId = String(selectedFarmId);
      if (lotParam.trim()) next.lot = lotParam.trim();
      next.semaine = semaine;
      setSearchParams(next);
    },
    [selectedFarmId, lotParam, setSearchParams]
  );

  const emptyRow = (lotPreFill?: string, semainePreFill?: string, overrideDate?: string): SortieRow => ({
    id: crypto.randomUUID(),
    semaine: semainePreFill ?? "",
    date: overrideDate ?? today,
    lot: lotPreFill ?? "",
    client: "",
    num_bl: "",
    type: TYPES[0],
    designation: "",
    nbre_dinde: "",
    qte_brute_kg: "",
    prix_kg: "",
    montant_ttc: "",
  });

  const loadSorties = useCallback(async () => {
    if (showFarmSelector || !hasLotInUrl || !hasSemaineInUrl || isSelectedLotClosed) return;
    setLoading(true);
    try {
      // Load ALL sorties for the lot (not filtered by semaine) so cumulative calculation can access all weeks
      const list = await api.sorties.list({
        farmId: pageFarmId ?? undefined,
        lot: lotParam.trim() || undefined,
      });
      const normalizedSemaine = (v: number | string | null | undefined): string => {
        if (v == null) return "";
        if (typeof v === "number") return `S${v}`;
        const s = String(v).trim();
        return s === "" ? "" : /^\d+$/.test(s) ? `S${s}` : s;
      };
      const mapped: SortieRow[] = list.map((r: SortieResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        semaine: normalizedSemaine(r.semaine),
        date: r.date ?? "",
        lot: r.lot ?? "",
        client: r.client ?? "",
        num_bl: r.num_bl ?? "",
        type: r.type ?? TYPES[0],
        designation: r.designation ?? "",
        nbre_dinde: r.nbre_dinde != null ? String(r.nbre_dinde) : "",
        qte_brute_kg: r.qte_brute_kg != null ? String(r.qte_brute_kg) : "",
        prix_kg: r.prix_kg != null ? String(r.prix_kg) : "",
        montant_ttc: r.montant_ttc != null ? String(r.montant_ttc) : "",
      }));
      const forSem = mapped.filter((r) => (r.semaine || "").trim() === selectedSemaine);
      originalSavedRowsRef.current = new Map(
        mapped.filter((r): r is SortieRow & { serverId: number } => r.serverId != null).map((r) => [r.serverId, { ...r }])
      );
      // Ensure MIN_TABLE_ROWS (7) rows for the selected semaine
      if (isReadOnly || !canCreate) {
        setRows(mapped);
      } else if (forSem.length >= MIN_TABLE_ROWS) {
        setRows(mapped);
      } else {
        // Pad with empty rows to reach MIN_TABLE_ROWS; dates incremented by +1 from last saved
        const toAdd = MIN_TABLE_ROWS - forSem.length;
        const startDate = forSem.length > 0
          ? (() => {
              const dates = forSem.map((r) => r.date).filter((d) => d?.trim());
              if (dates.length === 0) return today;
              const maxD = dates.sort()[dates.length - 1];
              return maxD ? addOneDay(maxD) : today;
            })()
          : today;
        const newRows: SortieRow[] = [];
        let nextDate = startDate;
        for (let i = 0; i < toAdd; i++) {
          newRows.push(emptyRow(lotParam.trim(), selectedSemaine, nextDate));
          nextDate = addOneDay(nextDate);
        }
        const finalRows = [...mapped, ...newRows];
        originalSavedRowsRef.current = new Map(
          finalRows.filter((r): r is SortieRow & { serverId: number } => r.serverId != null).map((r) => [r.serverId, { ...r }])
        );
        setRows(finalRows);
      }
    } catch {
      originalSavedRowsRef.current = new Map();
      if (canCreate && hasSemaineInUrl && selectedSemaine) {
        const newRows: SortieRow[] = [];
        let nextDate = today;
        for (let i = 0; i < MIN_TABLE_ROWS; i++) {
          newRows.push(emptyRow(lotParam.trim(), selectedSemaine, nextDate));
          nextDate = addOneDay(nextDate);
        }
        setRows(newRows);
      } else {
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, hasLotInUrl, hasSemaineInUrl, lotParam, selectedSemaine, isReadOnly, canCreate, toast, isSelectedLotClosed]);

  useEffect(() => {
    loadSorties();
  }, [loadSorties]);

  const addRow = () => {
    if (!canCreate || !selectedSemaine) return;
    
    // Get the rows as they appear in the display (filtered and sorted by date)
    const currentRows = rows
      .filter((r) => (r.semaine || "").trim() === selectedSemaine)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    
    // Find the last row in the display order (the one with the latest date)
    const lastDisplayRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
    const nextDate = lastDisplayRow?.date?.trim() ? addOneDay(lastDisplayRow.date) : today;
    const newRow = { ...emptyRow(lotParam.trim(), selectedSemaine), date: nextDate };
    
    // Simply append to the array - the display sorting will put it in the right place
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => (r.semaine || "").trim() === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.sorties
        .delete(row.serverId)
        .then(() => loadSorties())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof SortieRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        const qty = parseFloat(updated.qte_brute_kg) || 0;
        const price = parseFloat(updated.prix_kg) || 0;
        updated.montant_ttc = (qty * price).toFixed(2);
        return updated;
      })
    );
  };

  const rowToRequest = (r: SortieRow): SortieRequest => ({
    date: r.date || null,
    semaine: parseSemaineToNum(r.semaine),
    lot: r.lot || null,
    client: r.client || null,
    num_bl: r.num_bl || null,
    type: r.type || null,
    designation: r.designation || null,
    nbre_dinde: r.nbre_dinde.trim() !== "" ? parseInt(r.nbre_dinde, 10) : null,
    qte_brute_kg: r.qte_brute_kg.trim() !== "" ? parseFloat(r.qte_brute_kg) : null,
    prix_kg: r.prix_kg.trim() !== "" ? parseFloat(r.prix_kg) : null,
    montant_ttc: r.montant_ttc.trim() !== "" ? parseFloat(r.montant_ttc) : null,
  });

  const handleSave = async () => {
    if (!canCreate && !canUpdate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas enregistrer les données.", variant: "destructive" });
      return;
    }
    if (!selectedSemaine) {
      toast({ title: "Semaine requise", description: "Choisissez une semaine avant d'enregistrer.", variant: "destructive" });
      return;
    }
    const forSem = (r: SortieRow) => (r.semaine || "").trim() === selectedSemaine;
    const unsavedForSem = rows
      .filter((r) => forSem(r) && r.serverId == null)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const firstUnsaved = unsavedForSem[0];
    const savedRowsToUpdate = rows
      .filter((r) => forSem(r) && r.serverId != null && canUpdate)
      .filter((r) => {
        const orig = originalSavedRowsRef.current.get(r.serverId!);
        return orig && !rowDataEqual(r, orig);
      });

    const hasNewToCreate = canCreate && firstUnsaved && firstUnsaved.date.trim() !== "";
    const hasUpdates = savedRowsToUpdate.length > 0;

    if (!hasNewToCreate && !hasUpdates) {
      toast({
        title: "Aucune modification à enregistrer",
        description: "Remplissez la date du jour pour une nouvelle ligne, ou modifiez une ligne existante.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (hasNewToCreate) {
        await api.sorties.createBatch([rowToRequest(firstUnsaved!)], pageFarmId ?? undefined);
      }
      for (const row of savedRowsToUpdate) {
        await api.sorties.update(row.serverId!, rowToRequest(row), undefined);
        originalSavedRowsRef.current.set(row.serverId!, { ...row });
      }
      if (hasNewToCreate && hasUpdates) {
        toast({ title: "Enregistré", description: "Nouvelle ligne et modifications enregistrées." });
      } else if (hasNewToCreate) {
        toast({ title: "Jour enregistré", description: `Le ${firstUnsaved!.date} a été enregistré.` });
      } else if (hasUpdates) {
        toast({ title: "Modifications enregistrées", description: `${savedRowsToUpdate.length} ligne(s) mise(s) à jour.` });
      }
      loadSorties();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setSaving(false);
    }
  };

  const currentRows = selectedSemaine
    ? [...rows.filter((r) => (r.semaine || "").trim() === selectedSemaine)].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];
  const firstEditableRowIndex = currentRows.findIndex((r) => r.serverId == null);
  const firstUnsaved = currentRows.find((r) => r.serverId == null);
  const hasModifiedSavedRows = canUpdate && currentRows.some((r) => {
    if (r.serverId == null) return false;
    const orig = originalSavedRowsRef.current.get(r.serverId);
    return orig != null && !rowDataEqual(r, orig);
  });
  const hasSomethingToSave = (canCreate && firstUnsaved && firstUnsaved.date.trim() !== "") || hasModifiedSavedRows;

  // Calculate totals for the current week
  const weekTotal = (() => {
    const t = { nbre_dinde: 0, qte_brute_kg: 0, prix_kg: 0, montant_ttc: 0 };
    for (const r of currentRows) {
      t.nbre_dinde += toNum(r.nbre_dinde);
      // Only include qte_brute_kg, prix_kg, and montant_ttc for rows that have nbre_dinde
      if (r.nbre_dinde.trim() !== "") {
        t.qte_brute_kg += toNum(r.qte_brute_kg);
        t.prix_kg += toNum(r.prix_kg);
        t.montant_ttc += toNum(r.montant_ttc);
      }
    }
    return t;
  })();

  // Calculate cumulative totals up to the current week
  const cumulForSelectedSemaine = (() => {
    const t = { nbre_dinde: 0, qte_brute_kg: 0, prix_kg: 0, montant_ttc: 0 };
    
    // Get all semaines and sort them
    const sems = new Set(rows.map((r) => (r.semaine || "").trim()).filter(Boolean));
    const semOrder = Array.from(sems).sort((a, b) => {
      const numA = parseInt(a.replace(/^S?(\d+)$/i, "$1"), 10);
      const numB = parseInt(b.replace(/^S?(\d+)$/i, "$1"), 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    
    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => (r.semaine || "").trim() === sem);
      for (const r of weekRows) {
        t.nbre_dinde += toNum(r.nbre_dinde);
        // Only include qte_brute_kg, prix_kg, and montant_ttc for rows that have nbre_dinde
        if (r.nbre_dinde.trim() !== "") {
          t.qte_brute_kg += toNum(r.qte_brute_kg);
          t.prix_kg += toNum(r.prix_kg);
          t.montant_ttc += toNum(r.montant_ttc);
        }
      }
    }
    return t;
  })();

  const canShowExport = hasLotInUrl && hasSemaineInUrl && !isSelectedLotClosed && pageFarmId != null;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === pageFarmId)?.name ?? "Ferme")
      : (getStoredSelectedFarm()?.name ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport || !lotParam.trim() || !selectedSemaine) return;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: lotParam.trim(),
        semaine: selectedSemaine,
        rows: currentRows,
        weekTotal,
        cumul: cumulForSelectedSemaine,
        ageByRowId: new Map(),
      });
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    if (!canShowExport || !lotParam.trim() || !selectedSemaine) return;
    exportToPdf({
      farmName: exportFarmName,
      lot: lotParam.trim(),
      semaine: selectedSemaine,
      rows: currentRows,
      weekTotal,
      cumul: cumulForSelectedSemaine,
      ageByRowId: new Map(),
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>Sorties Ferme</h1>
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
          Enregistrement des ventes et sorties de dindes
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
              ? "Choisissez une ferme pour consulter les sorties. Vous pouvez changer de ferme sans vous déconnecter."
              : "Choisissez une ferme pour consulter et gérer les sorties. Vous pouvez changer de ferme sans vous déconnecter."}
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

          {!hasLotInUrl || isSelectedLotClosed ? (
            <>
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
                title="Choisir un lot — Sorties Ferme"
                emptyMessage="Aucun lot. Créez d'abord un effectif mis en place (placement) avec un numéro de lot."
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
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  Lot : <strong>{lotParam}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId) } : {})}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de lot
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Choisissez une semaine pour consulter et gérer les sorties ferme.
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
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Tag className="w-4 h-4 text-muted-foreground" />
              Lot : <strong>{lotParam}</strong>
            </span>
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
                    Tableau des Sorties
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
                      disabled={saving || loading || !selectedSemaine || !hasSomethingToSave}
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
                      <th>Date</th>
                      <th>Client</th>
                      <th>N° BL</th>
                      <th>Type</th>
                      <th>Désignation</th>
                      <th>Nbre Dinde</th>
                      <th>Qté Brute (kg)</th>
                      <th>Prix/kg</th>
                      <th>Montant TTC</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          Chargement…
                        </td>
                      </tr>
                    ) : (
                      <>
                        {currentRows.map((row, rowIndex) => {
                          const isFirstEditable = firstEditableRowIndex >= 0 && rowIndex === firstEditableRowIndex;
                          const rowReadOnly = isReadOnly || (row.serverId != null ? !canUpdate : !isFirstEditable);
                          const showDelete = row.serverId != null ? canDelete : canCreate;
                          return (
                            <tr key={row.id}>
                              <td>
                                <input type="date" value={row.date} onChange={(e) => updateRow(row.id, "date", e.target.value)} disabled={rowReadOnly} />
                              </td>
                              <td>
                                <input type="text" value={row.client} onChange={(e) => updateRow(row.id, "client", e.target.value)} placeholder="—" className="min-w-[100px]" disabled={rowReadOnly} />
                              </td>
                              <td>
                                <input type="text" value={row.num_bl} onChange={(e) => updateRow(row.id, "num_bl", e.target.value)} placeholder="—" disabled={rowReadOnly} />
                              </td>
                              <td>
                                <select value={row.type} onChange={(e) => updateRow(row.id, "type", e.target.value)} className="w-full min-w-[140px] bg-transparent border-0 outline-none text-sm" disabled={rowReadOnly}>
                                  {TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="min-w-[120px]">
                                {typeUsesDesignationDropdown(row.type) ? (
                                  <select
                                    value={row.designation}
                                    onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                    className="w-full bg-transparent border-0 outline-none text-sm"
                                    disabled={rowReadOnly}
                                  >
                                    <option value="">—</option>
                                    {DESIGNATION_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={row.designation}
                                    onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                    placeholder="—"
                                    disabled={rowReadOnly}
                                  />
                                )}
                              </td>
                              <td>
                                <input type="number" value={row.nbre_dinde} onChange={(e) => updateRow(row.id, "nbre_dinde", e.target.value)} placeholder="—" disabled={rowReadOnly || typeDisablesNbreDinde(row.type)} />
                              </td>
                              <td>
                                <input type="number" value={row.qte_brute_kg} onChange={(e) => updateRow(row.id, "qte_brute_kg", e.target.value)} placeholder="—" step="0.1" disabled={rowReadOnly} />
                              </td>
                              <td>
                                <input type="number" value={row.prix_kg} onChange={(e) => updateRow(row.id, "prix_kg", e.target.value)} placeholder="—" step="0.01" disabled={rowReadOnly} />
                              </td>
                              <td className="font-semibold text-sm">{row.montant_ttc || "0.00"}</td>
                              <td>
                                {showDelete && (
                                  <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" disabled={currentRows.length <= MIN_TABLE_ROWS}>
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
                              <td className="font-semibold text-sm">{weekTotal.nbre_dinde}</td>
                              <td className="font-semibold text-sm">{weekTotal.qte_brute_kg.toFixed(1)}</td>
                              <td className="font-semibold text-sm">{weekTotal.prix_kg.toFixed(2)}</td>
                              <td className="font-semibold text-sm">{weekTotal.montant_ttc.toFixed(2)}</td>
                              <td></td>
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={5} className="text-sm font-medium text-muted-foreground">
                                CUMUL
                              </td>
                              <td className="font-semibold text-sm">{cumulForSelectedSemaine.nbre_dinde}</td>
                              <td className="font-semibold text-sm">{cumulForSelectedSemaine.qte_brute_kg.toFixed(1)}</td>
                              <td className="font-semibold text-sm">{cumulForSelectedSemaine.prix_kg.toFixed(2)}</td>
                              <td className="font-semibold text-sm">{cumulForSelectedSemaine.montant_ttc.toFixed(2)}</td>
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
        </>
      )}
    </AppLayout>
  );
}
