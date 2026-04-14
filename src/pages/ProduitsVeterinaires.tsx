import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Check, Calendar, Trash2, Eraser, Download, FileSpreadsheet, FileText } from "lucide-react";
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
import { QuantityInput } from "@/components/ui/QuantityInput";
import { PriceInput } from "@/components/ui/PriceInput";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type LivraisonProduitVeterinaireResponse,
  type LivraisonProduitVeterinaireRequest,
  type LotWithStatusResponse,
} from "@/lib/api";
import { isClosedLotBlockedForSession, type ClosedLotSessionContext } from "@/lib/lotAccess";
import { sortSemaines, computeAgeByRowId } from "@/utils/semaineAgeUtils";
import { exportToExcel, exportToPdf } from "@/lib/produitsVeterinairesExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  PRODUITS_VETERINAIRES_TABLE_HEADERS,
  PRODUITS_VETERINAIRES_HEADER_CLASS,
  PRODUITS_VETERINAIRES_MAIN_HEADER_TITLE,
  produitsVeterinairesResolvedMontant,
  produitsVeterinairesEffectiveMontantForTotal,
} from "@/lib/produitsVeterinairesShared";

/**
 * FICHE DE SUIVI DES LIVRAISONS PRODUITS VETERINAIRES
 * Flow: Farm → Lot → Semaine → Table (like Suivi Technique Hebdomadaire / Livraisons Aliment).
 * Each semaine has its own table; TOTAL = current semaine, CUMUL = semaines up to current.
 * Permission matrix: canCreate for add/save; canUpdate for saved rows (Admin/RT only).
 * Persisted-row delete (trash): Admin/RT only (hasFullAccess). RF may remove unsaved padded rows only.
 * PER-ROW FLOW: All rows are editable (per permissions). Fill any row and click ✓ to save that row. Create uses POST; update uses PUT.
 * AGE / SEM: same workflow as Livraisons Aliment — SEM = S1, S2…; AGE = sequential (computeAgeByRowId + persist); display uses DB age when saved.
 * Columns: AGE, DATE, SEM, …
 */

interface VetRow {
  id: string;
  serverId?: number;
  date: string;
  age: string; // Stored sequential age from API when present; display uses displayAgeByRowId
  sem: string;
  designation: string;
  supplier: string;
  ug: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  deliveryNoteNumber: string;
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function formatQtyDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

function formatMoneyDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

/** MONTANT column — même règle que export / totaux. */
function formatMontantCell(row: VetRow): string {
  const m = produitsVeterinairesResolvedMontant(row);
  return m != null ? formatGroupedNumber(m, 2) : "—";
}

function fromNum(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

/** Add one day to a YYYY-MM-DD date string. */
function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Semaine label: prefer sem; legacy rows may have stored S1/S2… in age only. */
function getSemFromRow(r: { sem?: string; age?: string }): string {
  const sem = (r.sem || "").trim();
  if (sem) return sem;
  const legacy = (r.age || "").trim();
  return /^S\d+$/i.test(legacy) ? legacy : "";
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

/** Quick-pick S1-S36; S37+ via champ libre (same as Livraisons Aliment). */
const SEMAINES = Array.from({ length: 36 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

function isFilledVetLivraison(req: LivraisonProduitVeterinaireRequest): boolean {
  if (!req.date?.trim()) return false;
  const qteOk = req.qte != null && req.qte !== 0;
  const montantOk = req.montant != null && req.montant !== 0;
  return (
    !!(req.designation?.trim()) ||
    !!(req.supplier?.trim()) ||
    !!(req.ug?.trim()) ||
    qteOk ||
    !!(req.deliveryNoteNumber?.trim()) ||
    montantOk ||
    (req.prixPerUnit != null && req.prixPerUnit !== 0)
  );
}

export default function ProduitsVeterinaires() {
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
    user,
    isAdministrateur,
    isResponsableTechnique,
    canAccessAllFarms,
    isReadOnly,
    canCreate,
    canUpdate,
    hasFullAccess,
    selectedFarmId: authSelectedFarmId,
    selectedFarmName,
  } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [rows, setRows] = useState<VetRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const lotAccessCtx: ClosedLotSessionContext = useMemo(
    () => ({
      currentUserId: user?.id ?? null,
      isAdministrateur,
      isResponsableTechnique,
    }),
    [user?.id, isAdministrateur, isResponsableTechnique]
  );
  const isSelectedLotClosed = Boolean(
    lotFilter.trim() &&
      isClosedLotBlockedForSession(lotsWithStatus.find((l) => l.lot === lotFilter.trim()), lotAccessCtx)
  );
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  /** While focused, QTE shows raw editable string; blurred shows grouped + .00 (Livraisons Aliment). */
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

  const emptyRow = (sem?: string, overrideDate?: string): VetRow => ({
    id: crypto.randomUUID(),
    date: overrideDate ?? today,
    age: "", // AGE computed on display / save (like Livraisons Aliment)
    sem: sem ?? "",
    designation: "",
    supplier: "",
    ug: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
    deliveryNoteNumber: "",
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
      const list = await api.livraisonsProduitsVeterinaires.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: VetRow[] = list.map((r: LivraisonProduitVeterinaireResponse) => {
        const semRaw = (r.sem ?? "").trim();
        const ageRaw = r.age != null ? String(r.age).trim() : "";
        const legacySemInAge = !semRaw && /^S\d+$/i.test(ageRaw);
        return {
          id: crypto.randomUUID(),
          serverId: r.id,
          date: r.date ?? "",
          age: legacySemInAge ? "" : ageRaw,
          sem: semRaw || (legacySemInAge ? ageRaw : ""),
          designation: r.designation ?? "",
          supplier: r.supplier ?? "",
          ug: r.ug ?? "",
          qte: (() => {
            const s = fromNum(r.qte);
            if (!String(s).trim()) return "";
            const n = toOptionalNumber(s);
            return n != null ? n.toFixed(2) : "";
          })(),
          prixPerUnit: fromNum(r.prixPerUnit),
          montant: fromNum(r.montant),
          deliveryNoteNumber: r.deliveryNoteNumber ?? "",
        };
      });
      // Keep server dates as-is so AGE order matches persisted data after refresh (Livraisons Aliment workflow).
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
    api.livraisonsProduitsVeterinaires
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
    if (isReadOnly) return;
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
    const newRows: VetRow[] = [];
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

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => getSemFromRow(r) === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null) return; // Saved entries should use clearRow instead
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const clearRow = (id: string) => {
    if (!hasFullAccess) return;
    const row = rows.find((r) => r.id === id);
    if (!row || row.serverId == null) return; // No saved entry to clear
    api.livraisonsProduitsVeterinaires
      .delete(row.serverId)
      .then(() => loadMovements())
      .catch(() => { /* API error — logged in backend only */ });
  };

  const updateRow = (id: string, field: keyof VetRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "qte" || field === "prixPerUnit") {
          const qte = resolvedQteFromString(updated.qte);
          const prix = toNum(updated.prixPerUnit);
          if (qte != null && prix >= 0) {
            updated.montant = (qte * prix).toFixed(2);
          }
        }
        return updated;
      })
    );
  };

  /** Computed AGE for save logic and draft rows; ordering uses sem + date (+ DB age ties). */
  const ageByRowId = React.useMemo(
    () =>
      computeAgeByRowId(rows, (r) => getSemFromRow(r), (r) => r.date, (r) => {
        const n = parseInt(String(r.age).trim(), 10);
        return Number.isNaN(n) ? undefined : n;
      }),
    [rows]
  );

  /**
   * Display AGE: use persisted age when the row is saved (matches DB after refresh).
   * Unsaved / padded lines use the computed sequential age.
   */
  const displayAgeByRowId = React.useMemo(() => {
    const m = new Map<string, number | string>();
    if (loading) return m;
    for (const r of rows) {
      if (r.serverId != null) {
        const db = parseInt(String(r.age).trim(), 10);
        if (!Number.isNaN(db)) {
          m.set(r.id, db);
          continue;
        }
      }
      m.set(r.id, ageByRowId.get(r.id) ?? "—");
    }
    return m;
  }, [rows, ageByRowId, loading]);

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

  const weekTotal = (() => {
    const t = { qte: 0, prix: 0, montant: 0 };
    for (const r of currentRows) {
      t.qte += resolvedQteFromString(r.qte) ?? 0;
      t.prix += toNum(r.prixPerUnit);
      t.montant += produitsVeterinairesEffectiveMontantForTotal(r);
    }
    return t;
  })();

  const cumulForSelectedSemaine = (() => {
    let running = { qte: 0, prix: 0, montant: 0 };
    const sems = new Set(rows.map(getSemFromRow).filter(Boolean));
    const semOrder = sortSemaines([...sems]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => getSemFromRow(r) === sem);
      for (const r of weekRows) {
        running.qte += resolvedQteFromString(r.qte) ?? 0;
        running.prix += toNum(r.prixPerUnit);
        running.montant += produitsVeterinairesEffectiveMontantForTotal(r);
      }
    }
    return running;
  })();

  const rowToRequest = (r: VetRow, computedAge?: number): LivraisonProduitVeterinaireRequest => {
    const qteParsed = r.qte.trim() !== "" ? resolvedQteFromString(r.qte) : null;
    const prix = toNum(r.prixPerUnit);
    const montant =
      r.montant.trim() !== ""
        ? toNum(r.montant)
        : qteParsed != null && prix >= 0
          ? qteParsed * prix
          : null;
    const sem = getSemFromRow(r) || selectedSemaine || null;
    const age =
      computedAge != null
        ? String(computedAge)
        : r.age.trim() !== ""
          ? r.age.trim()
          : null;
    return {
      farmId: pageFarmId ?? undefined,
      lot: lotFilter.trim() || null,
      date: r.date || today,
      age,
      sem,
      designation: r.designation.trim() || null,
      supplier: r.supplier.trim() || null,
      ug: r.ug.trim() || null,
      deliveryNoteNumber: r.deliveryNoteNumber.trim() || null,
      qte: qteParsed ?? null,
      prixPerUnit: prix > 0 ? prix : null,
      montant: montant != null && Number.isFinite(montant) ? montant : null,
    };
  };

  /** Save a single row: create if unsaved, update if already saved. */
  const saveRow = async (row: VetRow) => {
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
    if (!lotFilter.trim() || !selectedSemaine) {
      toast({
        title: "Lot et semaine requis",
        description: "Indiquez le lot et la semaine.",
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
    const computedAge = ageByRowId.get(row.id) ?? undefined;
    const req = rowToRequest(row, computedAge);
    if (!isFilledVetLivraison(req)) {
      toast({
        title: "Ligne incomplète",
        description:
          "Remplissez au moins un champ (désignation, fournisseur, UG, quantité, prix, montant ou N° BR).",
        variant: "destructive",
      });
      return;
    }

    setSavingRowId(row.id);
    try {
      if (row.serverId != null) {
        await api.livraisonsProduitsVeterinaires.update(row.serverId, req);
        toast({ title: "Ligne mise à jour", description: `Le ${row.date} a été mis à jour.` });
        // Dispatch event to refresh price alert counter immediately
        window.dispatchEvent(new CustomEvent('priceAlertChanged'));
      } else {
        const created = await api.livraisonsProduitsVeterinaires.create(req);
        toast({ title: "Ligne enregistrée", description: `Le ${row.date} a été enregistré.` });
        // Dispatch event to refresh price alert counter immediately
        window.dispatchEvent(new CustomEvent('priceAlertChanged'));
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  serverId: created.id,
                  age: created.age != null ? String(created.age) : r.age,
                  sem: created.sem ?? r.sem,
                }
              : r
          )
        );
        return;
      }
      loadMovements();
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

  const colCount = PRODUITS_VETERINAIRES_TABLE_HEADERS.length + 2;

  const canShowExport = hasLotInUrl && hasSemaineInUrl && !isSelectedLotClosed && pageFarmId != null;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === selectedFarmId)?.name ?? selectedFarmName ?? "Ferme")
      : (selectedFarmName ?? "Ferme");

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
        ageByRowId: displayAgeByRowId,
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
      ageByRowId: displayAgeByRowId,
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>FICHE DE SUIVI DES LIVRAISONS PRODUITS VETERINAIRES</h1>
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
          Suivi des livraisons produits vétérinaires par lot et semaine
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
              ? "Choisissez une ferme pour consulter les livraisons produits vétérinaires."
              : "Choisissez une ferme pour consulter et gérer les livraisons produits vétérinaires."}
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
              if (isClosedLotBlockedForSession(status, lotAccessCtx)) {
                toast({
                  title: "Lot fermé",
                  description:
                    "Les données de ce lot ne sont pas accessibles pour votre compte. Choisissez un lot ouvert.",
                  variant: "destructive",
                });
                return;
              }
              setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId), lot } : { lot });
            }}
            canCreate={false}
            description="Sélectionnez un lot existant. La création d'un nouveau lot se fait uniquement dans Données mises en place."
            emptyMessage="Aucun lot. Créez d'abord un lot dans Données mises en place."
            title="Choisir un lot — Produits Vétérinaires"
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
            Choisissez une semaine pour consulter et gérer les livraisons produits vétérinaires.
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
                placeholder="ex. S37, S38..."
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
                    Livraisons produits vétérinaires
                  </h2>
                  {!isReadOnly && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Remplissez les lignes puis cliquez sur ✓ pour enregistrer chaque ligne.
                    </p>
                  )}
                </div>
                {canCreate && (
                  <div className="flex items-center gap-2">
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

              <div className="overflow-x-auto">
                <table className="table-farm">
                  <thead>
                    <tr>
                      {PRODUITS_VETERINAIRES_TABLE_HEADERS.map((h) => (
                        <th
                          key={h}
                          className={PRODUITS_VETERINAIRES_HEADER_CLASS[h]}
                          title={PRODUITS_VETERINAIRES_MAIN_HEADER_TITLE[h]}
                        >
                          {h}
                        </th>
                      ))}
                      <th className="w-9 min-w-0 max-w-9 shrink-0 !px-1" title="Enregistrer la ligne">✓</th>
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
                        {currentRows.map((row, index) => {
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
                              <td className="text-sm font-medium text-muted-foreground">
                                {getSemFromRow(row) || selectedSemaine || "—"}
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
                                  type="text"
                                  value={row.ug}
                                  onChange={(e) => updateRow(row.id, "ug", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
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
                              <td className="min-w-[140px] text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatQtyDisplay(row.qte)}
                                  </span>
                                ) : (
                                  <QuantityInput
                                    value={row.qte}
                                    onChange={(value) => updateRow(row.id, "qte", value)}
                                    isFocused={qteFocusRowId === row.id}
                                    onFocusChange={(focused) => setQteFocusRowId(focused ? row.id : null)}
                                    placeholder="—"
                                    className="w-full min-w-[7.5rem] tabular-nums text-center"
                                    showFormattedDisplay={true}
                                  />
                                )}
                              </td>
                              <td className="text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatMoneyDisplay(row.prixPerUnit)}
                                  </span>
                                ) : (
                                  <PriceInput
                                    value={row.prixPerUnit}
                                    onChange={(value) => updateRow(row.id, "prixPerUnit", value)}
                                    placeholder="—"
                                    className="w-full min-w-[5.625rem] tabular-nums text-center"
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
                              <td>
                                <div className="flex items-center gap-1">
                                  {row.serverId != null && hasFullAccess && (
                                    <button
                                      type="button"
                                      onClick={() => clearRow(row.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                      title="Effacer définitivement (Admin)"
                                    >
                                      <Eraser className="w-4 h-4" />
                                    </button>
                                  )}
                                  {(row.serverId == null || hasFullAccess) && index >= MIN_TABLE_ROWS && (
                                    <button
                                      type="button"
                                      onClick={() => removeRow(row.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                      disabled={currentRows.length <= MIN_TABLE_ROWS}
                                      title="Supprimer la ligne"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/60">
                          <td colSpan={6} className="text-sm font-medium text-muted-foreground">
                            TOTAL {selectedSemaine}
                          </td>
                          <td className="text-center" />
                          <td className="text-center tabular-nums whitespace-nowrap">
                            {formatGroupedNumber(weekTotal.qte, 2)}
                          </td>
                          <td className="text-center tabular-nums whitespace-nowrap">
                            {formatGroupedNumber(weekTotal.prix, 2)}
                          </td>
                          <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                            {formatGroupedNumber(weekTotal.montant, 2)}
                          </td>
                          <td className="w-9 max-w-9 !px-1" />
                          <td></td>
                        </tr>
                        <tr className="bg-muted/50">
                          <td colSpan={6} className="text-sm font-medium text-muted-foreground">
                            CUMUL
                          </td>
                          <td className="text-center" />
                          <td className="text-center tabular-nums whitespace-nowrap">
                            {formatGroupedNumber(cumulForSelectedSemaine.qte, 2)}
                          </td>
                          <td className="text-center tabular-nums whitespace-nowrap">
                            {formatGroupedNumber(cumulForSelectedSemaine.prix, 2)}
                          </td>
                          <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                            {formatGroupedNumber(cumulForSelectedSemaine.montant, 2)}
                          </td>
                          <td className="w-9 max-w-9 !px-1" />
                          <td></td>
                        </tr>
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
