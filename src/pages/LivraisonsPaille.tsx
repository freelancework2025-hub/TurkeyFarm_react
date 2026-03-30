import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Check, Calendar, Trash2, Download, FileSpreadsheet, FileText } from "lucide-react";
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
  type LivraisonPailleResponse,
  type LivraisonPailleRequest,
  type LotWithStatusResponse,
} from "@/lib/api";
import { isClosedLotBlockedForSession, type ClosedLotSessionContext } from "@/lib/lotAccess";
import { sortSemaines, computeAgeByRowId } from "@/utils/semaineAgeUtils";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { exportToExcel, exportToPdf } from "@/lib/livraisonsPailleExport";
import {
  LIVRAISON_PAILLE_TABLE_HEADERS,
  livraisonPailleEffectiveMontantForTotal,
} from "@/lib/livraisonsPailleShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

/**
 * FICHE DE SUIVI DES LIVRAISONS PAILLE
 * Flow: Farm → Lot → Semaine → Table (comme Livraisons Aliment).
 * TOTAL semaine, CUMUL = vide sanitaire + semaines jusqu’à la semaine choisie.
 * Vide sanitaire: une ligne en tête (API dédiée), ✓ pour enregistrer.
 * Tableau principal: ✓ par ligne (POST/PUT). Suppression ligne persistée: hasFullAccess ; lignes brouillon: canCreate.
 * AGE / SEM: même logique que Livraisons Aliment.
 */

/** Quick-pick S1-S36; S37+ via champ libre (same as Livraisons Aliment). */
const SEMAINES = Array.from({ length: 36 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

interface PailleRow {
  id: string;
  serverId?: number;
  date: string;
  age: string; // Stored sequential age from API when present; display uses displayAgeByRowId
  sem: string;
  designation: string;
  supplier: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  deliveryNoteNumber: string;
  numeroBR: string;
}

interface VideSanitairePailleState {
  date: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
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

/** MONTANT: stored value or qte × prix when empty (Livraisons Aliment / hygiène). */
function formatMontantCell(row: Pick<PailleRow, "qte" | "prixPerUnit" | "montant">): string {
  const m = toOptionalNumber(row.montant);
  if (m != null) return formatGroupedNumber(m, 2);
  const q = resolvedQteFromString(row.qte);
  const p = toOptionalNumber(row.prixPerUnit);
  if (q != null && p != null && p >= 0) return formatGroupedNumber(q * p, 2);
  return "—";
}

const VS_QTE_FOCUS_ID = "__vide_sanitaire_paille__";

const LIVRAISON_PAILLE_HEADER_CLASS: Record<(typeof LIVRAISON_PAILLE_TABLE_HEADERS)[number], string> = {
  AGE: "min-w-[70px]",
  DATE: "min-w-[100px]",
  SEM: "min-w-[60px]",
  DÉSIGNATION: "min-w-[180px]",
  FOURNISSEUR: "min-w-[120px]",
  "N° BL": "min-w-[90px]",
  "N° BR": "min-w-[90px]",
  QTE: "min-w-[128px] w-[8.5rem] !text-center",
  PRIX: "min-w-[80px] !text-center",
  MONTANT: "min-w-[90px] !text-center",
};

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

export default function LivraisonsPaille() {
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
  const [rows, setRows] = useState<PailleRow[]>([]);
  const [videSanitaire, setVideSanitaire] = useState<VideSanitairePailleState>(() => ({
    date: new Date().toISOString().split("T")[0],
    supplier: "",
    deliveryNoteNumber: "",
    numeroBR: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
  }));
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [hasExistingVideSanitaire, setHasExistingVideSanitaire] = useState(false);
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
  /** QTE: raw while focused, grouped when blurred (Livraisons Aliment). VS row uses VS_QTE_FOCUS_ID. */
  const [qteFocusRowId, setQteFocusRowId] = useState<string | null>(null);
  const [savingVideSanitaire, setSavingVideSanitaire] = useState(false);
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

  const emptyRow = (sem?: string, overrideDate?: string): PailleRow => ({
    id: crypto.randomUUID(),
    date: overrideDate ?? today,
    age: "", // AGE computed on display / save (like Livraisons Aliment)
    sem: sem ?? "",
    designation: "",
    supplier: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
    deliveryNoteNumber: "",
    numeroBR: "",
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
      const list = await api.livraisonsPaille.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: PailleRow[] = list.map((r: LivraisonPailleResponse) => {
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
          qte: (() => {
            const s = fromNum(r.qte);
            if (!String(s).trim()) return "";
            const n = toOptionalNumber(s);
            return n != null ? n.toFixed(2) : "";
          })(),
          prixPerUnit: fromNum(r.prixPerUnit),
          montant: fromNum(r.montant),
          deliveryNoteNumber: r.deliveryNoteNumber ?? "",
          numeroBR: r.numeroBR ?? "",
        };
      });
      // Keep server dates as-is so AGE order matches persisted data after refresh (Livraisons Aliment workflow).
      setRows(mapped);
      const vsRes = await api.videSanitairePaille
        .get(
          { farmId: pageFarmId ?? undefined, lot: lotFilter.trim() || undefined },
          undefined
        )
        .catch(() => undefined);
      if (vsRes) {
        setHasExistingVideSanitaire(true);
        setVideSanitaire({
          date: vsRes.date ?? today,
          supplier: vsRes.supplier ?? "",
          deliveryNoteNumber: vsRes.deliveryNoteNumber ?? "",
          numeroBR: vsRes.numeroBR ?? "",
          qte: (() => {
            const s = fromNum(vsRes.qte);
            if (!String(s).trim()) return "";
            const n = toOptionalNumber(s);
            return n != null ? n.toFixed(2) : "";
          })(),
          prixPerUnit: fromNum(vsRes.prixPerUnit),
          montant: fromNum(vsRes.montant),
        });
      } else {
        setHasExistingVideSanitaire(false);
        setVideSanitaire({
          date: today,
          supplier: "",
          deliveryNoteNumber: "",
          numeroBR: "",
          qte: "",
          prixPerUnit: "",
          montant: "",
        });
      }
    } catch {
      /* API error — logged in backend only */
      setRows([]);
      setHasExistingVideSanitaire(false);
      setVideSanitaire({
        date: today,
        supplier: "",
        deliveryNoteNumber: "",
        numeroBR: "",
        qte: "",
        prixPerUnit: "",
        montant: "",
      });
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
    api.livraisonsPaille
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
    if (showFarmSelector) return;
    const params: Record<string, string> = {};
    if (selectedFarmId != null) params.farmId = String(selectedFarmId);
    if (lotFilter.trim()) params.lot = lotFilter.trim();
    if (hasSemaineInUrl && trimmedSemaine) params.semaine = trimmedSemaine;
    setSearchParams(params, { replace: true });
  }, [showFarmSelector, selectedFarmId, lotFilter, hasSemaineInUrl, trimmedSemaine, setSearchParams]);

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
    const newRows: PailleRow[] = [];
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
    if (row?.serverId != null && !hasFullAccess) return;
    if (row?.serverId != null) {
      api.livraisonsPaille
        .delete(row.serverId)
        .then(() => loadMovements())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof PailleRow, value: string) => {
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

  const updateVideSanitaire = (field: keyof VideSanitairePailleState, value: string) => {
    setVideSanitaire((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "qte" || field === "prixPerUnit") {
        const qte = resolvedQteFromString(updated.qte);
        const prix = toNum(updated.prixPerUnit);
        if (qte != null && prix >= 0) {
          updated.montant = (qte * prix).toFixed(2);
        }
      }
      return updated;
    });
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

  const rowToRequest = (r: PailleRow, computedAge?: number): LivraisonPailleRequest => {
    const qte = r.qte.trim() !== "" ? resolvedQteFromString(r.qte) : null;
    const prix = toNum(r.prixPerUnit);
    const montant =
      r.montant.trim() !== ""
        ? toNum(r.montant)
        : qte != null && prix >= 0
          ? qte * prix
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
      qte: qte ?? null,
      prixPerUnit: prix > 0 ? prix : null,
      montant: montant != null && Number.isFinite(montant) ? montant : null,
      deliveryNoteNumber: r.deliveryNoteNumber.trim() || null,
      numeroBR: r.numeroBR.trim() || null,
    };
  };

  const handleSaveVideSanitaireOnly = async () => {
    if (!hasVideSanitaireToSave || videSanitaireReadOnly) return;
    setSavingVideSanitaire(true);
    try {
      await api.videSanitairePaille.put(
        {
          farmId: pageFarmId ?? undefined,
          lot: lotFilter.trim() || null,
          date: videSanitaire.date.trim() || null,
          supplier: videSanitaire.supplier.trim() || null,
          deliveryNoteNumber: videSanitaire.deliveryNoteNumber.trim() || null,
          numeroBR: videSanitaire.numeroBR.trim() || null,
          qte:
            videSanitaire.qte.trim() !== ""
              ? resolvedQteFromString(videSanitaire.qte)
              : null,
          prixPerUnit: toNum(videSanitaire.prixPerUnit) || null,
        },
        pageFarmId ?? undefined
      );
      toast({ title: "Vide sanitaire enregistré", description: "Les données du vide sanitaire ont été enregistrées." });
      loadMovements();
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer le vide sanitaire.",
        variant: "destructive",
      });
    } finally {
      setSavingVideSanitaire(false);
    }
  };

  /** Enregistre une ligne du tableau principal (création ou mise à jour). */
  const saveRow = async (row: PailleRow) => {
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
    const hasContent =
      (row.designation?.trim() ?? "") !== "" ||
      (row.supplier?.trim() ?? "") !== "" ||
      (row.qte?.trim() ?? "") !== "" ||
      (row.deliveryNoteNumber?.trim() ?? "") !== "" ||
      (row.numeroBR?.trim() ?? "") !== "";
    if (!hasContent) {
      toast({
        title: "Ligne incomplète",
        description: "Remplissez au moins un champ (désignation, fournisseur, quantité, N° BL ou N° BR).",
        variant: "destructive",
      });
      return;
    }

    setSavingRowId(row.id);
    try {
      const computedAge = ageByRowId.get(row.id) ?? undefined;
      const req = rowToRequest(row, computedAge);
      if (row.serverId != null) {
        await api.livraisonsPaille.update(row.serverId, req);
        toast({ title: "Ligne mise à jour", description: `Le ${row.date} a été mis à jour.` });
        loadMovements();
      } else {
        const created = await api.livraisonsPaille.create(req);
        toast({ title: "Ligne enregistrée", description: `Le ${row.date} a été enregistré.` });
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  serverId: created.id,
                  age: created.age != null ? String(created.age) : r.age,
                  sem:
                    created.sem != null && String(created.sem).trim() !== ""
                      ? String(created.sem).trim()
                      : r.sem,
                }
              : r
          )
        );
        return;
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
  const videSanitaireReadOnly = isReadOnly || (hasExistingVideSanitaire && !canUpdate);
  const hasVideSanitaireToSave = (videSanitaire.qte.trim() !== "" || videSanitaire.prixPerUnit.trim() !== "") && !videSanitaireReadOnly;
  const videSanitaireTotals = {
    qte: resolvedQteFromString(videSanitaire.qte) ?? 0,
    prix: toNum(videSanitaire.prixPerUnit),
    montant: livraisonPailleEffectiveMontantForTotal(videSanitaire),
  };
  const weekTotal = (() => {
    const t = { qte: 0, prix: 0, montant: 0 };
    for (const r of currentRows) {
      t.qte += resolvedQteFromString(r.qte) ?? 0;
      t.prix += toNum(r.prixPerUnit);
      t.montant += livraisonPailleEffectiveMontantForTotal(r);
    }
    return t;
  })();
  const cumulForSelectedSemaine = (() => {
    let running = { ...videSanitaireTotals };
    const sems = new Set(rows.map(getSemFromRow).filter(Boolean));
    const semOrder = sortSemaines([...sems]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => getSemFromRow(r) === sem);
      for (const r of weekRows) {
        running.qte += resolvedQteFromString(r.qte) ?? 0;
        running.prix += toNum(r.prixPerUnit);
        running.montant += livraisonPailleEffectiveMontantForTotal(r);
      }
    }
    return running;
  })();

  const colCount = LIVRAISON_PAILLE_TABLE_HEADERS.length + 2;

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
        rows: currentRows,
        weekTotal,
        cumul: cumulForSelectedSemaine,
        ageByRowId: displayAgeByRowId,
        videSanitaire,
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
      videSanitaire,
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>FICHE DE SUIVI DES LIVRAISONS PAILLE</h1>
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
          Suivi des livraisons paille par lot et semaine
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
              ? "Choisissez une ferme pour consulter les livraisons paille."
              : "Choisissez une ferme pour consulter et gérer les livraisons paille."}
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
            title="Choisir un lot — Livraisons Paille"
            description="Sélectionnez un lot existant. La création d'un nouveau lot se fait uniquement dans Données mises en place."
            emptyMessage="Aucun lot. Créez d'abord un lot dans Données mises en place."
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
            Choisissez une semaine pour consulter et gérer les livraisons paille.
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
                    Livraisons paille
                  </h2>
                  {!isReadOnly && (canCreate || canUpdate) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Remplissez les lignes puis cliquez sur ✓ pour enregistrer chaque ligne.
                    </p>
                  )}
                </div>
                {canCreate && (
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

              <div className="overflow-x-auto">
                <table className="table-farm">
                  <thead>
                    <tr>
                      {LIVRAISON_PAILLE_TABLE_HEADERS.map((label) => (
                        <th
                          key={label}
                          className={LIVRAISON_PAILLE_HEADER_CLASS[label]}
                          title={
                            label === "AGE"
                              ? "Âge séquentiel (1, 2, 3…) sur tout le lot"
                              : label === "SEM"
                                ? "Semaine (S1, S2…)"
                                : undefined
                          }
                        >
                          {label}
                        </th>
                      ))}
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
                        <tr className="bg-red-500/15 text-foreground">
                          <td className="text-sm font-medium text-muted-foreground">—</td>
                          <td>
                            <input
                              type="date"
                              value={videSanitaire.date}
                              onChange={(e) => updateVideSanitaire("date", e.target.value)}
                              disabled={videSanitaireReadOnly}
                              className="bg-transparent border-0 outline-none text-sm w-full"
                            />
                          </td>
                          <td className="text-sm font-medium text-muted-foreground">—</td>
                          <td className="font-medium text-sm">Vide sanitaire</td>
                          <td>
                            <input
                              type="text"
                              value={videSanitaire.supplier}
                              onChange={(e) => updateVideSanitaire("supplier", e.target.value)}
                              placeholder="—"
                              disabled={videSanitaireReadOnly}
                              className="min-w-[100px] bg-transparent border-0 outline-none text-sm w-full"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={videSanitaire.deliveryNoteNumber}
                              onChange={(e) => updateVideSanitaire("deliveryNoteNumber", e.target.value)}
                              placeholder="—"
                              disabled={videSanitaireReadOnly}
                              className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={videSanitaire.numeroBR}
                              onChange={(e) => updateVideSanitaire("numeroBR", e.target.value)}
                              placeholder="—"
                              disabled={videSanitaireReadOnly}
                              className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                            />
                          </td>
                          <td className="min-w-[128px] text-center">
                            {videSanitaireReadOnly ? (
                              <span className="block text-center tabular-nums px-1 py-0.5">
                                {formatQtyDisplay(videSanitaire.qte)}
                              </span>
                            ) : (
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  qteFocusRowId === VS_QTE_FOCUS_ID
                                    ? videSanitaire.qte
                                    : toOptionalNumber(videSanitaire.qte) != null
                                      ? formatGroupedNumber(toOptionalNumber(videSanitaire.qte)!, 2)
                                      : ""
                                }
                                onFocus={() => setQteFocusRowId(VS_QTE_FOCUS_ID)}
                                onBlur={(e) => {
                                  setQteFocusRowId(null);
                                  const raw = e.target.value;
                                  if (raw.trim() === "") {
                                    updateVideSanitaire("qte", "");
                                    return;
                                  }
                                  const n = resolvedQteFromString(raw);
                                  if (n == null || !Number.isFinite(n)) {
                                    updateVideSanitaire("qte", "");
                                  } else {
                                    updateVideSanitaire("qte", n.toFixed(2));
                                  }
                                }}
                                onChange={(e) => updateVideSanitaire("qte", e.target.value)}
                                placeholder="—"
                                className="w-full min-w-[7.5rem] tabular-nums text-center bg-transparent border-0 outline-none text-sm"
                              />
                            )}
                          </td>
                          <td className="text-center">
                            {videSanitaireReadOnly ? (
                              <span className="block text-center tabular-nums px-1 py-0.5">
                                {formatMoneyDisplay(videSanitaire.prixPerUnit)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                value={videSanitaire.prixPerUnit}
                                onChange={(e) => updateVideSanitaire("prixPerUnit", e.target.value)}
                                placeholder="—"
                                step="0.01"
                                min={0}
                                disabled={videSanitaireReadOnly}
                                className="w-full min-w-[5.5rem] tabular-nums text-center bg-transparent border-0 outline-none text-sm"
                              />
                            )}
                          </td>
                          <td className="font-semibold text-sm text-center tabular-nums whitespace-nowrap">
                            {formatMontantCell(videSanitaire)}
                          </td>
                          <td className="w-9 max-w-9 shrink-0 !px-1 text-center align-middle">
                            {hasVideSanitaireToSave && (
                              <button
                                type="button"
                                onClick={handleSaveVideSanitaireOnly}
                                disabled={savingVideSanitaire || loading}
                                className="text-muted-foreground hover:text-primary transition-colors p-0.5 inline-flex justify-center"
                                title="Enregistrer le vide sanitaire"
                              >
                                {savingVideSanitaire ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </td>
                          <td />
                        </tr>
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
                                      const n = resolvedQteFromString(raw);
                                      if (n == null || !Number.isFinite(n)) {
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
                              <td className="text-center" />
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
                              <td />
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={5} className="text-sm font-medium text-muted-foreground">
                                CUMUL
                              </td>
                              <td className="text-center" />
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
