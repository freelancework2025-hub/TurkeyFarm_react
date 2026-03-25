import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Loader2, Plus, Check, Trash2, Download, FileSpreadsheet, FileText } from "lucide-react";
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
  type DepenseDiversResponse,
  type DepenseDiversRequest,
  type LotWithStatusResponse,
} from "@/lib/api";
import { sortSemaines, computeAgeByRowId } from "@/utils/semaineAgeUtils";
import { exportToExcel, exportToPdf } from "@/lib/depensesDiversExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

/**
 * DÉPENSES DIVERS
 * Flow: Farm → Lot → Semaine → Vide sanitaire table (top) + Dépenses divers table (main).
 * Vide sanitaire: dedicated table with DATE, désignation, fournisseur, N°BL, N°BR, UG, quantité, prix, montant. TOTAL and CUMUL for quantité and montant.
 * Main table: TOTAL = current semaine, CUMUL = vide sanitaire cumul + semaines up to current.
 * Permission: canCreate / canUpdate (Admin/RT). Persisted delete: hasFullAccess only; RF can remove unsaved lines.
 * PER-ROW: ✓ saves one line (POST/PUT) for Vide sanitaire (age=VS) and main table alike.
 */

/** Quick-pick S1–S36; S37+ via champ libre. */
const SEMAINES = Array.from({ length: 36 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

/** Options de désignation : l'utilisateur peut sélectionner ou saisir librement. */
const DESIGNATION_OPTIONS = ["ENTRETIEN ET REP"];
const VS_AGE = "VS"; // Vide sanitaire marker

interface DepenseDiversRow {
  id: string;
  serverId?: number;
  date: string;
  /** Semaine (S1, S2…) ou VS — mappé sur le champ API `age`. */
  sem: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  ug: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  lot: string;
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function fromNum(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

function formatQtyDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

function formatMoneyDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

/** MONTANT: stored value or qte × prix when empty (Livraisons Aliment). */
function formatMontantCell(row: Pick<DepenseDiversRow, "qte" | "prixPerUnit" | "montant">): string {
  const m = toOptionalNumber(row.montant);
  if (m != null) return formatGroupedNumber(m, 2);
  const q = toOptionalNumber(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && q >= 0 && p >= 0) return formatGroupedNumber(q * p, 2);
  return "—";
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Semaine / VS depuis la ligne (champ UI `sem`). */
function getSemFromRow(r: DepenseDiversRow): string {
  return (r.sem || "").trim();
}

/** Aligné sur DepenseDiversService.isFilledRow ; vide sanitaire exige au moins un champ métier (pas seulement l’âge VS). */
function isFilledDepenseRequest(req: DepenseDiversRequest, isVs: boolean): boolean {
  if (!req.date?.trim()) return false;
  const qteOk = req.qte != null && req.qte > 0;
  const montantOk = req.montant != null && req.montant > 0;
  const meaningful =
    !!(req.designation?.trim()) ||
    !!(req.supplier?.trim()) ||
    qteOk ||
    !!(req.deliveryNoteNumber?.trim()) ||
    !!(req.numeroBR?.trim()) ||
    !!(req.ug?.trim()) ||
    montantOk;
  if (isVs) return meaningful;
  return meaningful || !!(req.age?.trim());
}

/** Sort lots: Lot1, Lot2, ... (natural order by number or string). */
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

export default function DepensesDivers() {
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

  const { canAccessAllFarms, isReadOnly, canCreate, canUpdate, hasFullAccess, selectedFarmId: authSelectedFarmId, selectedFarmName } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [rows, setRows] = useState<DepenseDiversRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSelectedLotClosed = Boolean(lotParam.trim() && lotsWithStatus.find((l) => l.lot === lotParam.trim())?.closed);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  /** QTE: raw while focused, grouped when blurred (Livraisons Aliment). */
  const [qteFocusVsRowId, setQteFocusVsRowId] = useState<string | null>(null);
  const [qteFocusRowId, setQteFocusRowId] = useState<string | null>(null);
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

  const lastExportFarmIdRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (!canAccessAllFarms || !pageFarmId || showFarmSelector) return;
    const hasSelectedFarm = farms.some((f) => f.id === pageFarmId);
    if (hasSelectedFarm) return;
    if (lastExportFarmIdRef.current === pageFarmId) return;
    lastExportFarmIdRef.current = pageFarmId;
    api.farms
      .list()
      .then((list) => setFarms(list))
      .catch(() => { });
  }, [canAccessAllFarms, pageFarmId, showFarmSelector, farms]);

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

  const emptyRow = (sem?: string, overrideDate?: string): DepenseDiversRow => ({
    id: crypto.randomUUID(),
    date: overrideDate ?? today,
    sem: sem ?? "",
    designation: "",
    supplier: "",
    deliveryNoteNumber: "",
    numeroBR: "",
    ug: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
    lot: lotFilter,
  });

  /** Start date for a semaine: S2 = last day of S1 + 1; first semaine of lot = previous lot last day + 1 (or today for first lot). */
  const getStartDateForSemaine = useCallback(
    (semaine: string): string => {
      const ages = new Set(rows.map((r) => getSemFromRow(r)).filter((a) => a && a !== VS_AGE));
      ages.add(semaine.trim());
      const semOrder = sortSemaines([...ages]);
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
      const list = await api.depensesDivers.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: DepenseDiversRow[] = list.map((r: DepenseDiversResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        date: r.date ?? "",
        sem: (r.age ?? "").trim(),
        designation: r.designation ?? "",
        supplier: r.supplier ?? "",
        deliveryNoteNumber: r.deliveryNoteNumber ?? "",
        numeroBR: r.numeroBR ?? "",
        ug: r.ug ?? "",
        qte: (() => {
          const s = fromNum(r.qte);
          if (!String(s).trim()) return "";
          const n = toOptionalNumber(s);
          return n != null ? n.toFixed(2) : "";
        })(),
        prixPerUnit: fromNum(r.prixPerUnit),
        montant: fromNum(r.montant),
        lot: r.lot ?? "",
      }));
      setRows(mapped);
    } catch {
      /* API error — logged in backend only */
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, isSelectedLotClosed]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  // When current lot is not the first, fetch previous lot's last date so S1 of this lot starts the day after.
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
    api.depensesDivers
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
    if (!hasSemaineInUrl || !selectedSemaine || isReadOnly) return;
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
    const newRows: DepenseDiversRow[] = [];
    let nextDate = startDate;
    for (let i = 0; i < toAdd; i++) {
      newRows.push(emptyRow(selectedSemaine, nextDate));
      nextDate = addOneDay(nextDate);
    }
    setRows((prev) => [...prev, ...newRows]);
  }, [hasSemaineInUrl, selectedSemaine, rows.length, getStartDateForSemaine, isReadOnly]);

  const addRow = () => {
    if (!canCreate || !selectedSemaine) return;
    const currentRows = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    const lastRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
    const nextDate =
      lastRow?.date?.trim() ? addOneDay(lastRow.date) : getStartDateForSemaine(selectedSemaine);
    const newRow = { ...emptyRow(selectedSemaine), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const addRowVideSanitaire = () => {
    if (!canCreate || !lotFilter.trim()) return;
    const vsRows = rows.filter((r) => getSemFromRow(r) === VS_AGE);
    const lastRow = vsRows.length > 0 ? vsRows[vsRows.length - 1] : null;
    const nextDate = lastRow?.date?.trim() ? addOneDay(lastRow.date) : today;
    const newRow = { ...emptyRow(VS_AGE), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRowVideSanitaire = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.serverId != null && !hasFullAccess) return;
    if (row.serverId != null) {
      api.depensesDivers
        .delete(row.serverId)
        .then(() => loadMovements())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !hasFullAccess) return;
    if (row?.serverId != null) {
      api.depensesDivers
        .delete(row.serverId)
        .then(() => loadMovements())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof DepenseDiversRow, value: string) => {
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

  const rowToRequest = (r: DepenseDiversRow): DepenseDiversRequest => {
    const qteParsed = r.qte.trim() !== "" ? toNum(r.qte) : null;
    const prix = toNum(r.prixPerUnit);
    const montant =
      r.montant.trim() !== ""
        ? toNum(r.montant)
        : qteParsed != null && prix >= 0
          ? qteParsed * prix
          : null;
    const isVs = getSemFromRow(r) === VS_AGE;
    const semLabel = r.sem.trim();
    const ageField = semLabel || (isVs ? VS_AGE : selectedSemaine || null) || null;
    return {
      farmId: pageFarmId ?? undefined,
      lot: r.lot.trim() || lotFilter.trim() || null,
      date: r.date || today,
      age: ageField,
      designation: r.designation.trim() || null,
      supplier: r.supplier.trim() || null,
      deliveryNoteNumber: r.deliveryNoteNumber.trim() || null,
      numeroBR: r.numeroBR?.trim() || null,
      ug: r.ug?.trim() || null,
      qte: qteParsed ?? null,
      prixPerUnit: prix > 0 ? prix : null,
      montant: montant != null && montant >= 0 ? montant : null,
    };
  };

  const saveRow = async (row: DepenseDiversRow) => {
    const isVs = getSemFromRow(row) === VS_AGE;
    const canSaveNew = row.serverId == null && canCreate;
    const canSaveExisting = row.serverId != null && canUpdate;
    if (!canSaveNew && !canSaveExisting) {
      toast({
        title: "Non autorisé",
        description: "Vous ne pouvez pas enregistrer cette ligne.",
        variant: "destructive",
      });
      return;
    }
    if (!lotFilter.trim()) {
      toast({
        title: "Lot requis",
        description: "Indiquez un lot.",
        variant: "destructive",
      });
      return;
    }
    if (!isVs && !selectedSemaine) {
      toast({
        title: "Semaine requise",
        description: "Choisissez une semaine pour les lignes du tableau principal.",
        variant: "destructive",
      });
      return;
    }
    if (!row.date?.trim()) {
      toast({
        title: "Date requise",
        description: "Remplissez la date pour enregistrer la ligne.",
        variant: "destructive",
      });
      return;
    }
    const req = rowToRequest(row);
    if (!isFilledDepenseRequest(req, isVs)) {
      toast({
        title: "Ligne incomplète",
        description:
          "Remplissez au moins un champ (désignation, fournisseur, N° BL, N° BR, UG, quantité ou montant).",
        variant: "destructive",
      });
      return;
    }

    setSavingRowId(row.id);
    try {
      if (row.serverId != null) {
        await api.depensesDivers.update(row.serverId, req);
        toast({
          title: "Ligne mise à jour",
          description: `Le ${row.date} a été mis à jour.`,
        });
        loadMovements();
      } else {
        const created = await api.depensesDivers.create(req);
        toast({
          title: isVs ? "Vide sanitaire enregistré" : "Ligne enregistrée",
          description: `Le ${row.date} a été enregistré.`,
        });
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  serverId: created.id,
                  sem:
                    created.age != null && String(created.age).trim() !== ""
                      ? String(created.age).trim()
                      : r.sem,
                  lot: created.lot ?? r.lot,
                }
              : r
          )
        );
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer la ligne.",
        variant: "destructive",
      });
    } finally {
      setSavingRowId(null);
    }
  };

  /** Âge séquentiel (jours) pour toutes les lignes hors vide sanitaire ; l’API ne stocke que la semaine dans `age`. */
  const ageByRowId = React.useMemo(() => {
    const rowsForAge = rows.filter((r) => getSemFromRow(r) !== VS_AGE);
    return computeAgeByRowId(rowsForAge, (r) => getSemFromRow(r), (r) => r.date);
  }, [rows]);

  /** Affichage AGE : pas de valeur numérique persistée côté API pour cette fiche (seulement S1… / VS). */
  const displayAgeByRowId = React.useMemo(() => {
    const m = new Map<string, number | string>();
    if (loading) return m;
    for (const r of rows) {
      if (getSemFromRow(r) === VS_AGE) continue;
      m.set(r.id, ageByRowId.get(r.id) ?? "—");
    }
    return m;
  }, [rows, ageByRowId, loading]);

  const videSanitaireRows = [...rows.filter((r) => getSemFromRow(r) === VS_AGE)].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );
  const videSanitaireTotalQte = videSanitaireRows.reduce((acc, r) => acc + toNum(r.qte), 0);
  const videSanitaireTotalPrix = videSanitaireRows.reduce((acc, r) => acc + toNum(r.prixPerUnit), 0);
  const videSanitaireTotalMontant = videSanitaireRows.reduce((acc, r) => acc + toNum(r.montant), 0);

  const currentRows = selectedSemaine
    ? [...rows.filter((r) => getSemFromRow(r) === selectedSemaine)].sort((a, b) => {
        const ageA = displayAgeByRowId.get(a.id);
        const ageB = displayAgeByRowId.get(b.id);
        const numA = typeof ageA === "number" ? ageA : Number.MAX_SAFE_INTEGER;
        const numB = typeof ageB === "number" ? ageB : Number.MAX_SAFE_INTEGER;
        if (numA !== numB) return numA - numB;
        return (a.date || "").localeCompare(b.date || "");
      })
    : [];
  const weekTotalQte = currentRows.reduce((acc, r) => acc + toNum(r.qte), 0);
  const weekTotalPrix = currentRows.reduce((acc, r) => acc + toNum(r.prixPerUnit), 0);
  const weekTotalMontant = currentRows.reduce((acc, r) => acc + toNum(r.montant), 0);
  const semainesOnly = new Set(rows.map((r) => getSemFromRow(r)).filter((a) => a && a !== VS_AGE));
  const semOrder = sortSemaines([...semainesOnly]);
  const idx = semOrder.indexOf(selectedSemaine ?? "");
  const semsUpTo = idx < 0 ? (selectedSemaine ? [selectedSemaine] : []) : semOrder.slice(0, idx + 1);
  const cumulQte =
    videSanitaireTotalQte +
    semsUpTo.reduce(
      (sum, sem) => sum + rows.filter((r) => getSemFromRow(r) === sem).reduce((a, r) => a + toNum(r.qte), 0),
      0
    );
  const cumulPrix =
    videSanitaireTotalPrix +
    semsUpTo.reduce(
      (sum, sem) => sum + rows.filter((r) => getSemFromRow(r) === sem).reduce((a, r) => a + toNum(r.prixPerUnit), 0),
      0
    );
  const cumulMontant =
    videSanitaireTotalMontant +
    semsUpTo.reduce(
      (sum, sem) => sum + rows.filter((r) => getSemFromRow(r) === sem).reduce((a, r) => a + toNum(r.montant), 0),
      0
    );
  const colCount = 12;
  const vsColCount = 11;

  const canShowExport = hasLotInUrl && hasSemaineInUrl && !isSelectedLotClosed && pageFarmId != null;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === pageFarmId)?.name ?? "Ferme")
      : (selectedFarmName ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport || !lotFilter.trim() || !selectedSemaine) return;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: lotFilter.trim(),
        semaine: selectedSemaine,
        weekTotalQte,
        weekTotalPrix,
        weekTotalMontant,
        cumulQte,
        cumulPrix,
        cumulMontant,
        ageByRowId: displayAgeByRowId,
        rows: currentRows.map((r) => ({
          id: r.id,
          date: r.date,
          age: r.sem,
          designation: r.designation,
          supplier: r.supplier,
          deliveryNoteNumber: r.deliveryNoteNumber,
          numeroBR: r.numeroBR,
          ug: r.ug,
          qte: r.qte,
          prixPerUnit: r.prixPerUnit,
          montant: r.montant,
        })),
        videSanitaireRows: videSanitaireRows.map((r) => ({
          date: r.date,
          designation: r.designation,
          supplier: r.supplier,
          deliveryNoteNumber: r.deliveryNoteNumber,
          numeroBR: r.numeroBR,
          ug: r.ug,
          qte: r.qte,
          prixPerUnit: r.prixPerUnit,
          montant: r.montant,
        })),
        videSanitaireTotalQte,
        videSanitaireTotalPrix,
        videSanitaireTotalMontant,
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
      weekTotalQte,
      weekTotalPrix,
      weekTotalMontant,
      cumulQte,
      cumulPrix,
      cumulMontant,
      ageByRowId: displayAgeByRowId,
      rows: currentRows.map((r) => ({
        id: r.id,
        date: r.date,
        age: r.sem,
        designation: r.designation,
        supplier: r.supplier,
        deliveryNoteNumber: r.deliveryNoteNumber,
        numeroBR: r.numeroBR,
        ug: r.ug,
        qte: r.qte,
        prixPerUnit: r.prixPerUnit,
        montant: r.montant,
      })),
      videSanitaireRows: videSanitaireRows.map((r) => ({
        date: r.date,
        designation: r.designation,
        supplier: r.supplier,
        deliveryNoteNumber: r.deliveryNoteNumber,
        numeroBR: r.numeroBR,
        ug: r.ug,
        qte: r.qte,
        prixPerUnit: r.prixPerUnit,
        montant: r.montant,
      })),
      videSanitaireTotalQte,
      videSanitaireTotalPrix,
      videSanitaireTotalMontant,
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>Dépenses divers</h1>
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
          Suivi des dépenses divers par lot — date, âge, désignation, fournisseur, N°BL, QTE, prix, montant
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
              ? "Choisissez une ferme pour consulter les dépenses divers."
              : "Choisissez une ferme pour consulter et gérer les dépenses divers."}
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
            Reconnectez-vous et choisissez une ferme pour accéder aux dépenses divers.
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
            title="Choisir un lot — Dépenses divers"
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
            Choisissez une semaine pour consulter et gérer les dépenses divers.
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
                placeholder="ex. S37, S38…"
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

          <datalist id="designation-options">
            {DESIGNATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
          <div className="space-y-6 w-full min-w-0">
            {/* Vide sanitaire table */}
            <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
                <h2 className="text-lg font-display font-bold text-foreground">Vide sanitaire</h2>
                {!isReadOnly && canCreate && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addRowVideSanitaire}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <Plus className="w-4 h-4" /> Ligne
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto w-full">
                <table className="table-farm">
                  <thead>
                    <tr>
                      <th className="min-w-[90px]">DATE</th>
                      <th className="min-w-[120px]">DÉSIGNATION</th>
                      <th className="min-w-[100px]">FOURNISSEUR</th>
                      <th className="min-w-[80px]">N° BL</th>
                      <th className="min-w-[80px]">N° BR</th>
                      <th className="min-w-[60px]">UG</th>
                      <th className="min-w-[128px] w-[8.5rem] !text-center">QTE</th>
                      <th className="min-w-[80px] !text-center">PRIX</th>
                      <th className="min-w-[90px] !text-center">MONTANT</th>
                      <th className="w-9 min-w-0 max-w-9 shrink-0 !px-1" title="Enregistrer">
                        ✓
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={vsColCount} className="p-8 text-center text-muted-foreground">
                          Chargement…
                        </td>
                      </tr>
                    ) : (
                      <>
                        {videSanitaireRows.map((row) => {
                          const rowReadOnly =
                            isReadOnly ||
                            (row.serverId == null && !canCreate) ||
                            (row.serverId != null && !canUpdate);
                          const canSaveRow =
                            (row.serverId == null && canCreate) || (row.serverId != null && canUpdate);
                          const showDelete = row.serverId != null ? hasFullAccess : canCreate;
                          const isSaving = savingRowId === row.id;
                          return (
                            <tr key={row.id}>
                              <td>
                                <input
                                  type="date"
                                  value={row.date}
                                  onChange={(e) => updateRow(row.id, "date", e.target.value)}
                                  disabled={rowReadOnly}
                                  className="bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  list="designation-options"
                                  value={row.designation}
                                  onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="min-w-[120px] bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.supplier}
                                  onChange={(e) => updateRow(row.id, "supplier", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="min-w-[100px] bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.deliveryNoteNumber}
                                  onChange={(e) => updateRow(row.id, "deliveryNoteNumber", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
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
                                  type="text"
                                  value={row.ug}
                                  onChange={(e) => updateRow(row.id, "ug", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td className="min-w-[128px] text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatQtyDisplay(row.qte)}
                                  </span>
                                ) : (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={
                                      qteFocusVsRowId === row.id
                                        ? row.qte
                                        : toOptionalNumber(row.qte) != null
                                          ? formatGroupedNumber(toOptionalNumber(row.qte)!, 2)
                                          : ""
                                    }
                                    onFocus={() => setQteFocusVsRowId(row.id)}
                                    onBlur={(e) => {
                                      setQteFocusVsRowId(null);
                                      const raw = e.target.value;
                                      if (raw.trim() === "") {
                                        updateRow(row.id, "qte", "");
                                        return;
                                      }
                                      const n = toOptionalNumber(raw);
                                      if (n == null || n < 0) {
                                        updateRow(row.id, "qte", "");
                                      } else {
                                        updateRow(row.id, "qte", n.toFixed(2));
                                      }
                                    }}
                                    onChange={(e) => updateRow(row.id, "qte", e.target.value)}
                                    placeholder="—"
                                    className="w-full min-w-[7.5rem] tabular-nums text-center"
                                  />
                                )}
                              </td>
                              <td className="text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatMoneyDisplay(row.prixPerUnit)}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    value={row.prixPerUnit}
                                    onChange={(e) => updateRow(row.id, "prixPerUnit", e.target.value)}
                                    placeholder="—"
                                    step="0.01"
                                    min={0}
                                    disabled={rowReadOnly}
                                    className="w-full min-w-[5.5rem] tabular-nums text-center"
                                  />
                                )}
                              </td>
                              <td className="font-semibold text-sm text-center tabular-nums whitespace-nowrap">
                                {formatMontantCell(row)}
                              </td>
                              <td className="w-9 max-w-9 shrink-0 !px-1 text-center align-middle">
                                {canSaveRow && (
                                  <button
                                    type="button"
                                    onClick={() => saveRow(row)}
                                    disabled={isSaving || loading}
                                    className="text-muted-foreground hover:text-primary transition-colors p-0.5 inline-flex justify-center"
                                    title="Enregistrer la ligne"
                                  >
                                    {isSaving ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </td>
                              <td className="align-middle">
                                {showDelete && (
                                  <button
                                    type="button"
                                    onClick={() => removeRowVideSanitaire(row.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                    disabled={false}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {videSanitaireRows.length > 0 && (
                          <>
                            <tr className="bg-muted/60">
                              <td colSpan={6} className="text-sm font-medium text-muted-foreground">
                                TOTAL
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(videSanitaireTotalQte, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(videSanitaireTotalPrix, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                                {formatGroupedNumber(videSanitaireTotalMontant, 2)}
                              </td>
                              <td className="w-9 max-w-9 !px-1" />
                              <td />
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={6} className="text-sm font-medium text-muted-foreground">
                                CUMUL
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(videSanitaireTotalQte, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(videSanitaireTotalPrix, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                                {formatGroupedNumber(videSanitaireTotalMontant, 2)}
                              </td>
                              <td className="w-9 max-w-9 !px-1" />
                              <td />
                            </tr>
                          </>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Main dépenses divers table */}
            <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">Dépenses divers</h2>
                  {!isReadOnly && (canCreate || canUpdate) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Chaque ligne = un jour. Enregistrez avec ✓ ; les lignes déjà enregistrées restent modifiables si vous avez le droit de mise à jour.
                    </p>
                  )}
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

              <div className="overflow-x-auto w-full">
                <table className="table-farm">
                  <thead>
                    <tr>
                      <th className="min-w-[70px]" title="Âge séquentiel (1, 2, 3…)">AGE</th>
                      <th className="min-w-[100px]">DATE</th>
                      <th className="min-w-[60px]" title="Semaine (S1, S2…)">SEM</th>
                      <th className="min-w-[180px]">DÉSIGNATION</th>
                      <th className="min-w-[120px]">FOURNISSEUR</th>
                      <th className="min-w-[90px]">N° BL</th>
                      <th className="min-w-[90px]">N° BR</th>
                      <th className="min-w-[128px] w-[8.5rem] !text-center">QTE</th>
                      <th className="min-w-[80px] !text-center">PRIX</th>
                      <th className="min-w-[90px] !text-center">MONTANT</th>
                      <th className="w-9 min-w-0 max-w-9 shrink-0 !px-1" title="Enregistrer">
                        ✓
                      </th>
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
                        {currentRows.map((row) => {
                          const rowReadOnly =
                            isReadOnly ||
                            (row.serverId == null && !canCreate) ||
                            (row.serverId != null && !canUpdate);
                          const canSaveRow =
                            (row.serverId == null && canCreate) || (row.serverId != null && canUpdate);
                          const showDelete = row.serverId != null ? hasFullAccess : canCreate;
                          const isSaving = savingRowId === row.id;
                          return (
                            <tr key={row.id}>
                              <td className="text-sm font-medium text-muted-foreground">
                                {displayAgeByRowId.get(row.id) ?? "—"}
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
                              <td>
                                <input
                                  type="text"
                                  value={row.sem}
                                  onChange={(e) => updateRow(row.id, "sem", e.target.value)}
                                  placeholder={selectedSemaine}
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  list="designation-options"
                                  value={row.designation}
                                  onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="min-w-[120px] bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.supplier}
                                  onChange={(e) => updateRow(row.id, "supplier", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="min-w-[100px] bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.deliveryNoteNumber}
                                  onChange={(e) => updateRow(row.id, "deliveryNoteNumber", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
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
                              <td className="min-w-[128px] text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatQtyDisplay(row.qte)}
                                  </span>
                                ) : (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={
                                      qteFocusRowId === row.id
                                        ? row.qte
                                        : toOptionalNumber(row.qte) != null
                                          ? formatGroupedNumber(toOptionalNumber(row.qte)!, 2)
                                          : ""
                                    }
                                    onFocus={() => setQteFocusRowId(row.id)}
                                    onBlur={(e) => {
                                      setQteFocusRowId(null);
                                      const raw = e.target.value;
                                      if (raw.trim() === "") {
                                        updateRow(row.id, "qte", "");
                                        return;
                                      }
                                      const n = toOptionalNumber(raw);
                                      if (n == null || n < 0) {
                                        updateRow(row.id, "qte", "");
                                      } else {
                                        updateRow(row.id, "qte", n.toFixed(2));
                                      }
                                    }}
                                    onChange={(e) => updateRow(row.id, "qte", e.target.value)}
                                    placeholder="—"
                                    className="w-full min-w-[7.5rem] tabular-nums text-center"
                                  />
                                )}
                              </td>
                              <td className="text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatMoneyDisplay(row.prixPerUnit)}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    value={row.prixPerUnit}
                                    onChange={(e) => updateRow(row.id, "prixPerUnit", e.target.value)}
                                    placeholder="—"
                                    step="0.01"
                                    min={0}
                                    disabled={rowReadOnly}
                                    className="w-full min-w-[5.5rem] tabular-nums text-center"
                                  />
                                )}
                              </td>
                              <td className="font-semibold text-sm text-center tabular-nums whitespace-nowrap">
                                {formatMontantCell(row)}
                              </td>
                              <td className="w-9 max-w-9 shrink-0 !px-1 text-center align-middle">
                                {canSaveRow && (
                                  <button
                                    type="button"
                                    onClick={() => saveRow(row)}
                                    disabled={isSaving || loading}
                                    className="text-muted-foreground hover:text-primary transition-colors p-0.5 inline-flex justify-center"
                                    title="Enregistrer la ligne"
                                  >
                                    {isSaving ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                              </td>
                              <td className="text-right align-middle">
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
                              Aucune dépense. {canCreate && "Ajoutez une ligne pour commencer."}
                            </td>
                          </tr>
                        )}
                        {currentRows.length > 0 && (
                          <>
                            <tr className="bg-muted/60">
                              <td colSpan={7} className="text-sm font-medium text-muted-foreground">
                                TOTAL {selectedSemaine}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(weekTotalQte, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(weekTotalPrix, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                                {formatGroupedNumber(weekTotalMontant, 2)}
                              </td>
                              <td className="w-9 max-w-9 !px-1" />
                              <td />
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={7} className="text-sm font-medium text-muted-foreground">
                                CUMUL (Vide sanitaire + semaines)
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(cumulQte, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(cumulPrix, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                                {formatGroupedNumber(cumulMontant, 2)}
                              </td>
                              <td className="w-9 max-w-9 !px-1" />
                              <td />
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
