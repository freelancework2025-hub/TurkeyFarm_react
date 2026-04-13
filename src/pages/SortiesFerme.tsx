import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Check, Loader2, Plus, Tag, Trash2, Eraser, Download, FileSpreadsheet, FileText } from "lucide-react";
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
import { api, type FarmResponse, type SortieRequest, type SortieResponse, type LotWithStatusResponse } from "@/lib/api";
import { isClosedLotBlockedForSession, type ClosedLotSessionContext } from "@/lib/lotAccess";
import { sortSemaines } from "@/utils/semaineAgeUtils";
import { exportToExcel, exportToPdf } from "@/lib/sortiesFermeExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import {
  SORTIES_FERME_TABLE_HEADERS,
  SORTIES_FERME_HEADER_CLASS,
  SORTIES_FERME_MAIN_HEADER_TITLE,
  sortiesFermeTotalRowLabelColSpan,
  sortiesFermeResolvedMontant,
  sortiesFermeEffectiveMontantForTotal,
} from "@/lib/sortiesFermeShared";

/**
 * Permissions alignées sur Livraisons Aliment : canCreate / canUpdate / hasFullAccess.
 * Enregistrement par ligne : ✓ sur chaque ligne (création ou mise à jour). Barre : + Ligne si canCreate.
 * Ligne persistée : suppression réservée à hasFullAccess (Admin/RT) ; brouillon : canCreate.
 */

const TYPES = [
  "Divers",
  "Consommation Employés (kg)",
  "Gratuite (kg)",
  "Vente Dinde Vive",
  "Vente Aliment",
  "Vente Fumier",
];

/** Désignation options when type is Consommation Employés, Gratuite, or Vente Dinde Vive */
const DESIGNATION_OPTIONS = ["male", "femelle", "Déclassé male", "Déclassée Femelle"];

const TYPES_WITH_DESIGNATION_DROPDOWN = [
  "Consommation Employés (kg)",
  "Gratuite (kg)",
  "Vente Dinde Vive",
  "Vente Aliment",
  "Vente Fumier",
];

const TYPES_WITHOUT_NBRE_DINDE = [
  "Vente Aliment",
  "Vente Fumier",
  "Divers",
];

function typeHasDefaultDesignation(type: string): boolean {
  return type === "Vente Aliment" || type === "Vente Fumier";
}

function typeDefaultDesignation(type: string): string {
  if (type === "Vente Aliment") return "ALIMENT";
  if (type === "Vente Fumier") return "FUMIER";
  return "";
}

function typeUsesDesignationDropdown(type: string): boolean {
  return TYPES_WITH_DESIGNATION_DROPDOWN.includes(type);
}

function getDesignationOptions(type: string): string[] {
  if (type === "Vente Aliment") {
    return ["ALIMENT"];
  }
  return DESIGNATION_OPTIONS;
}

function typeDisablesNbreDinde(type: string): boolean {
  return TYPES_WITHOUT_NBRE_DINDE.includes(type);
}

/** Convert string to number (spaces, thin space, comma decimals). */
function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function formatNbreDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 0) : "—";
}

function formatQtyDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

function formatMoneyDisplay(s: string): string {
  const n = toOptionalNumber(s);
  return n != null ? formatGroupedNumber(n, 2) : "—";
}

/** Montant — même règle que export / totaux. */
function formatMontantCell(row: Pick<SortieRow, "qte_brute_kg" | "prix_kg" | "montant_ttc">): string {
  const m = sortiesFermeResolvedMontant(row);
  return m != null ? formatGroupedNumber(m, 2) : "—";
}

/** Vide sanitaire (API `semaine` = 0) ; puis S1–S36 comme Livraisons Aliment. */
const VS_SEMAINE = "VS";
const SEMAINES_NUMEROTEES = Array.from({ length: 36 }, (_, i) => `S${i + 1}`);
/** Grille : VS en premier, puis S1… */
const SEMAINES = [VS_SEMAINE, ...SEMAINES_NUMEROTEES];

/** Minimum table rows to display (7 default rows for sequential save workflow) */
const MIN_TABLE_ROWS = 7;

function isFilledSortie(req: SortieRequest): boolean {
  if (!req.date?.trim()) return false;
  const qteOk = req.qte_brute_kg != null && req.qte_brute_kg !== 0;
  const montantOk = req.montant_ttc != null && req.montant_ttc !== 0;
  return (
    !!(req.client?.trim()) ||
    !!(req.num_bl?.trim()) ||
    !!(req.type?.trim()) ||
    !!(req.designation?.trim()) ||
    (req.nbre_dinde != null && req.nbre_dinde !== 0) ||
    qteOk ||
    montantOk ||
    (req.prix_kg != null && req.prix_kg !== 0)
  );
}

/** Libellé semaine (VS, S1…) → entier API : VS = 0, S1 = 1, … */
function semaineLabelToApi(s: string): number | null {
  if (s == null || s.trim() === "") return null;
  const t = s.trim();
  if (t.toUpperCase() === VS_SEMAINE) return 0;
  const m = t.match(/^S?(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

/** Clé de filtre / comparaison (VS insensible à la casse). */
function normalizeSemaineKey(s: string): string {
  const t = (s || "").trim();
  return t.toUpperCase() === "VS" ? VS_SEMAINE : t;
}

/** Semaine affichée / filtre depuis la ligne. */
function getSemFromRow(r: SortieRow): string {
  return normalizeSemaineKey(r.semaine ?? "");
}

/** Ordre cumul : VS d’abord, puis Sn via sortSemaines. */
function sortSemainesSortiesOrder(labels: string[]): string[] {
  const trimmed = labels.map((x) => x.trim()).filter(Boolean);
  const vs = trimmed.find((x) => x.toUpperCase() === "VS");
  const rest = sortSemaines(trimmed.filter((x) => x.toUpperCase() !== "VS"));
  return vs != null ? [VS_SEMAINE, ...rest] : rest;
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
    normalizeSemaineKey(a.semaine) === normalizeSemaineKey(b.semaine) &&
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
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [rows, setRows] = useState<SortieRow[]>([]);
  const lotAccessCtx: ClosedLotSessionContext = useMemo(
    () => ({
      currentUserId: user?.id ?? null,
      isAdministrateur,
      isResponsableTechnique,
    }),
    [user?.id, isAdministrateur, isResponsableTechnique]
  );
  const isSelectedLotClosed = Boolean(
    lotParam.trim() &&
      isClosedLotBlockedForSession(lotsWithStatus.find((l) => l.lot === lotParam.trim()), lotAccessCtx)
  );
  const [loading, setLoading] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  /** Qté brute: raw while focused, grouped when blurred (Livraisons Aliment). */
  const [qteFocusRowId, setQteFocusRowId] = useState<string | null>(null);
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

  const lastExportFarmIdRef = useRef<number | null>(null);
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
        if (typeof v === "number") {
          if (v === 0) return VS_SEMAINE;
          return `S${v}`;
        }
        const s = String(v).trim();
        if (s === "") return "";
        if (/^\d+$/.test(s)) {
          const n = parseInt(s, 10);
          return n === 0 ? VS_SEMAINE : `S${s}`;
        }
        return s.toUpperCase() === "VS" ? VS_SEMAINE : s;
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
        qte_brute_kg: (() => {
          if (r.qte_brute_kg == null) return "";
          const n = typeof r.qte_brute_kg === "number" ? r.qte_brute_kg : toOptionalNumber(String(r.qte_brute_kg));
          return n != null ? n.toFixed(2) : String(r.qte_brute_kg);
        })(),
        prix_kg: (() => {
          if (r.prix_kg == null) return "";
          const n = typeof r.prix_kg === "number" ? r.prix_kg : toOptionalNumber(String(r.prix_kg));
          return n != null ? n.toFixed(2) : String(r.prix_kg);
        })(),
        montant_ttc: (() => {
          if (r.montant_ttc == null) return "";
          const n = typeof r.montant_ttc === "number" ? r.montant_ttc : toOptionalNumber(String(r.montant_ttc));
          return n != null ? n.toFixed(2) : String(r.montant_ttc);
        })(),
      }));
      const forSem = mapped.filter((r) => getSemFromRow(r) === normalizeSemaineKey(selectedSemaine));
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
          newRows.push(emptyRow(lotParam.trim(), normalizeSemaineKey(selectedSemaine), nextDate));
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
          newRows.push(emptyRow(lotParam.trim(), normalizeSemaineKey(selectedSemaine), nextDate));
          nextDate = addOneDay(nextDate);
        }
        setRows(newRows);
      } else {
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, hasLotInUrl, hasSemaineInUrl, lotParam, selectedSemaine, isReadOnly, canCreate, isSelectedLotClosed]);

  useEffect(() => {
    loadSorties();
  }, [loadSorties]);

  const addRow = () => {
    if (!canCreate || !selectedSemaine) return;
    
    // Get the rows as they appear in the display (filtered and sorted by date)
    const sk = normalizeSemaineKey(selectedSemaine);
    const currentRows = rows
      .filter((r) => getSemFromRow(r) === sk)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    
    // Find the last row in the display order (the one with the latest date)
    const lastDisplayRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
    const nextDate = lastDisplayRow?.date?.trim() ? addOneDay(lastDisplayRow.date) : today;
    const newRow = { ...emptyRow(lotParam.trim(), sk), date: nextDate };
    
    // Simply append to the array - the display sorting will put it in the right place
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => getSemFromRow(r) === normalizeSemaineKey(selectedSemaine));
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !hasFullAccess) return;
    if (row?.serverId != null) {
      api.sorties
        .delete(row.serverId)
        .then(() => loadSorties())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const clearRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.serverId == null || !hasFullAccess) {
      toast({ title: "Non autorisé", description: "Seuls les administrateurs peuvent supprimer cette ligne.", variant: "destructive" });
      return;
    }

    api.sorties
      .delete(row.serverId)
      .then(() => {
        toast({ title: "Ligne supprimée", description: `L'enregistrement a été supprimé de la base de données.` });
        loadSorties();
      })
      .catch(() => {
        toast({ title: "Erreur", description: "Impossible de supprimer la ligne.", variant: "destructive" });
      });
  };

  const updateRow = (id: string, field: keyof SortieRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "type" && typeHasDefaultDesignation(value) && !updated.designation.trim()) {
          updated.designation = typeDefaultDesignation(value);
        }
        if (field === "qte_brute_kg" || field === "prix_kg") {
          const qStr = updated.qte_brute_kg.trim();
          const pStr = updated.prix_kg.trim();
          const qResolved = resolvedQteFromString(updated.qte_brute_kg);
          const price = pStr !== "" ? toNum(updated.prix_kg) : null;
          if (qStr === "" && pStr === "") {
            updated.montant_ttc = "";
          } else if (qResolved != null && price != null && price >= 0) {
            updated.montant_ttc = (qResolved * price).toFixed(2);
          }
        }
        return updated;
      })
    );
  };

  const rowToRequest = (r: SortieRow): SortieRequest => {
    const qParsed = r.qte_brute_kg.trim() !== "" ? resolvedQteFromString(r.qte_brute_kg) : null;
    const prix = r.prix_kg.trim() !== "" ? toNum(r.prix_kg) : NaN;
    const montantExplicit = r.montant_ttc.trim() !== "" ? toNum(r.montant_ttc) : null;
    const montant =
      montantExplicit != null && Number.isFinite(montantExplicit)
        ? montantExplicit
        : qParsed != null && Number.isFinite(prix) && prix >= 0
          ? qParsed * prix
          : null;
    const nbreRaw = r.nbre_dinde.trim() !== "" ? Math.round(toNum(r.nbre_dinde)) : null;
    return {
      date: r.date || null,
      semaine: semaineLabelToApi(r.semaine),
      lot: r.lot || null,
      client: r.client || null,
      num_bl: r.num_bl || null,
      type: r.type || null,
      designation: r.designation || null,
      nbre_dinde: nbreRaw != null && Number.isFinite(nbreRaw) && nbreRaw !== 0 ? nbreRaw : null,
      qte_brute_kg: qParsed ?? null,
      prix_kg: Number.isFinite(prix) && prix > 0 ? prix : null,
      montant_ttc: montant != null && Number.isFinite(montant) ? montant : null,
    };
  };

  /** Save one row: create (batch d’un élément) ou update — même logique que LivraisonsAliment. */
  const saveRow = async (row: SortieRow) => {
    const canSaveNew = row.serverId == null && canCreate;
    const canSaveExisting = row.serverId != null && canUpdate;
    if (!canSaveNew && !canSaveExisting) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas enregistrer cette ligne.", variant: "destructive" });
      return;
    }
    if (!selectedSemaine) {
      toast({ title: "Semaine requise", description: "Choisissez une semaine.", variant: "destructive" });
      return;
    }
    const sk = normalizeSemaineKey(selectedSemaine);
    if (getSemFromRow(row) !== sk) {
      toast({
        title: "Semaine incohérente",
        description: "La colonne SEM de la ligne doit correspondre à la semaine affichée.",
        variant: "destructive",
      });
      return;
    }
    if (!row.date?.trim()) {
      toast({ title: "Date requise", description: "Remplissez la date pour enregistrer la ligne.", variant: "destructive" });
      return;
    }
    const req = rowToRequest(row);
    if (row.serverId == null) {
      if (!isFilledSortie(req)) {
        toast({
          title: "Ligne incomplète",
          description:
            "Remplissez au moins un champ (client, N° BL, type, désignation, nombre de dindes, quantité, prix ou montant).",
          variant: "destructive",
        });
        return;
      }
    } else {
      const orig = originalSavedRowsRef.current.get(row.serverId);
      if (orig != null && rowDataEqual(row, orig)) {
        toast({
          title: "Rien à enregistrer",
          description: "Aucune modification sur cette ligne.",
          variant: "destructive",
        });
        return;
      }
    }

    setSavingRowId(row.id);
    try {
      if (row.serverId == null) {
        const createdList = await api.sorties.createBatch([req], pageFarmId ?? undefined);
        const created = createdList[0];
        if (!created) {
          toast({ title: "Erreur", description: "Réponse serveur inattendue.", variant: "destructive" });
          return;
        }
        toast({ title: "Ligne enregistrée", description: `Le ${row.date} a été enregistré.` });
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, serverId: created.id } : r
          )
        );
        const merged: SortieRow = { ...row, serverId: created.id };
        originalSavedRowsRef.current.set(created.id, { ...merged });
        
        // Auto-sync to production after successful save (silent, no user notification)
        if (pageFarmId) {
          try {
            const token = sessionStorage.getItem('elevagepro_token');
            const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:7070';
            await fetch(`${apiBase}/api/sorties/sync-to-production?lot=${encodeURIComponent(lotParam.trim())}&semaine=${encodeURIComponent(selectedSemaine)}&farmId=${pageFarmId}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
          } catch {
            // Silent failure - sync happens in background
          }
        }
        
        return;
      }

      await api.sorties.update(row.serverId, req, undefined);
      originalSavedRowsRef.current.set(row.serverId, { ...row });
      toast({ title: "Ligne mise à jour", description: `Le ${row.date} a été mis à jour.` });
      
      // Auto-sync to production after successful save (silent, no user notification)
      if (pageFarmId) {
        try {
          const token = sessionStorage.getItem('elevagepro_token');
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:7070';
          await fetch(`${apiBase}/api/sorties/sync-to-production?lot=${encodeURIComponent(lotParam.trim())}&semaine=${encodeURIComponent(selectedSemaine)}&farmId=${pageFarmId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
        } catch {
          // Silent failure - sync happens in background
        }
      }
      
      loadSorties();
    } catch {
      toast({ title: "Erreur", description: "Impossible d'enregistrer la ligne.", variant: "destructive" });
    } finally {
      setSavingRowId(null);
    }
  };

  const selectedSemKey = normalizeSemaineKey(selectedSemaine || "");

  /** Âge séquentiel : uniquement S1, S2… (comme Livraisons Aliment). VS n’a pas d’âge ; la chaîne repart à S1. */




  /** Comme LivraisonsAliment : tri par AGE (nombre), puis date ; VS = pas d’âge → tri effectif par date. */
  const currentRows = selectedSemaine
    ? [...rows.filter((r) => getSemFromRow(r) === selectedSemKey)].sort((a, b) => {
        return (a.date || "").localeCompare(b.date || "");
      })
    : [];
  // Calculate totals for the current week
  const weekTotal = (() => {
    const t = { nbre_dinde: 0, qte_brute_kg: 0, prix_kg: 0, montant_ttc: 0 };
    const isVs = selectedSemKey === VS_SEMAINE;
    for (const r of currentRows) {
      t.nbre_dinde += toNum(r.nbre_dinde);
      // For VS: include all rows; for other weeks: include rows with meaningful data (qte, prix, or montant)
      const hasQte = (resolvedQteFromString(r.qte_brute_kg) ?? 0) > 0;
      const hasMontant = (toNum(r.montant_ttc) ?? 0) > 0;
      const hasPrix = (toNum(r.prix_kg) ?? 0) > 0;
      const shouldInclude = isVs || hasQte || hasMontant || hasPrix;
      if (shouldInclude) {
        t.qte_brute_kg += resolvedQteFromString(r.qte_brute_kg) ?? 0;
        t.prix_kg += toNum(r.prix_kg);
        t.montant_ttc += sortiesFermeEffectiveMontantForTotal(r);
      }
    }
    return t;
  })();

  // Calculate cumulative totals up to the current week
  const cumulForSelectedSemaine = (() => {
    const t = { nbre_dinde: 0, qte_brute_kg: 0, prix_kg: 0, montant_ttc: 0 };
    
    const sems = new Set(rows.map((r) => getSemFromRow(r)).filter(Boolean));
    const semOrder = sortSemainesSortiesOrder([...sems]);

    const idx = semOrder.indexOf(selectedSemKey);
    const semsUpTo = idx < 0 ? (selectedSemKey ? [selectedSemKey] : []) : semOrder.slice(0, idx + 1);

    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => getSemFromRow(r) === sem);
      const isVsSem = sem === VS_SEMAINE;
      for (const r of weekRows) {
        t.nbre_dinde += toNum(r.nbre_dinde);
        // For VS: include all rows; for other weeks: include rows with meaningful data (qte, prix, or montant)
        const hasQte = (resolvedQteFromString(r.qte_brute_kg) ?? 0) > 0;
        const hasMontant = (toNum(r.montant_ttc) ?? 0) > 0;
        const hasPrix = (toNum(r.prix_kg) ?? 0) > 0;
        const shouldInclude = isVsSem || hasQte || hasMontant || hasPrix;
        if (shouldInclude) {
          t.qte_brute_kg += resolvedQteFromString(r.qte_brute_kg) ?? 0;
          t.prix_kg += toNum(r.prix_kg);
          t.montant_ttc += sortiesFermeEffectiveMontantForTotal(r);
        }
      }
    }
    return t;
  })();

  const canShowExport = hasLotInUrl && hasSemaineInUrl && !isSelectedLotClosed && pageFarmId != null;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId
      ? (farms.find((f) => f.id === pageFarmId)?.name ?? "Ferme")
      : (selectedFarmName ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport || !lotParam.trim() || !selectedSemaine) return;
    const isVs = selectedSemaine === VS_SEMAINE;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: lotParam.trim(),
        semaine: selectedSemaine,
        rows: currentRows.map((r) => ({
          id: r.id,
          semaine: r.semaine,
          date: r.date,
          lot: r.lot,
          client: r.client,
          num_bl: r.num_bl,
          type: r.type,
          designation: r.designation,
          nbre_dinde: r.nbre_dinde,
          qte_brute_kg: r.qte_brute_kg,
          prix_kg: r.prix_kg,
          montant_ttc: r.montant_ttc,
        })),
        weekTotal,
        cumul: isVs ? weekTotal : cumulForSelectedSemaine,
      });
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    if (!canShowExport || !lotParam.trim() || !selectedSemaine) return;
    const isVs = selectedSemaine === VS_SEMAINE;
    exportToPdf({
      farmName: exportFarmName,
      lot: lotParam.trim(),
      semaine: selectedSemaine,
      rows: currentRows.map((r) => ({
        id: r.id,
        semaine: r.semaine,
        date: r.date,
        lot: r.lot,
        client: r.client,
        num_bl: r.num_bl,
        type: r.type,
        designation: r.designation,
        nbre_dinde: r.nbre_dinde,
        qte_brute_kg: r.qte_brute_kg,
        prix_kg: r.prix_kg,
        montant_ttc: r.montant_ttc,
      })),
      weekTotal,
      cumul: isVs ? weekTotal : cumulForSelectedSemaine,
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
                title="Choisir un lot — Sorties Ferme"
                description="Sélectionnez un lot existant. La création d'un nouveau lot se fait uniquement dans Données mises en place."
                emptyMessage="Aucun lot. Créez d'abord un lot dans Données mises en place."
              />
            </>
          ) : !hasSemaineInUrl ? (
            <div className="space-y-6">
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
                    title={s === VS_SEMAINE ? "Vide sanitaire (avant S1)" : undefined}
                    onClick={() => selectSemaine(s)}
                    className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group ${
                      s === VS_SEMAINE ? "border-primary/50 bg-muted/30" : "border-border"
                    }`}
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
                  {!isReadOnly && (
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
                      {SORTIES_FERME_TABLE_HEADERS.map((h) => (
                        <th
                          key={h}
                          className={SORTIES_FERME_HEADER_CLASS[h]}
                          title={SORTIES_FERME_MAIN_HEADER_TITLE[h]}
                        >
                          {h}
                        </th>
                      ))}
                      <th className="w-9 min-w-0 max-w-9 shrink-0 !px-1" title="Enregistrer la ligne">
                        ✓
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={SORTIES_FERME_TABLE_HEADERS.length + 2} className="p-8 text-center text-muted-foreground">
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
                                  value={row.semaine}
                                  onChange={(e) => updateRow(row.id, "semaine", e.target.value)}
                                  placeholder={selectedSemaine}
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.client}
                                  onChange={(e) => updateRow(row.id, "client", e.target.value)}
                                  placeholder="—"
                                  className="min-w-[100px] bg-transparent border-0 outline-none text-sm w-full"
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.num_bl}
                                  onChange={(e) => updateRow(row.id, "num_bl", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <select
                                  value={row.type}
                                  onChange={(e) => updateRow(row.id, "type", e.target.value)}
                                  className="w-full min-w-[140px] bg-transparent border-0 outline-none text-sm rounded px-1 py-0.5"
                                  disabled={rowReadOnly}
                                >
                                  {TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="min-w-[120px]">
                                {(row.type === "Vente Aliment" || row.type === "Vente Fumier") ? (
                                  <div className="relative">
                                    <input
                                      type="text"
                                      list={`designation-datalist-${row.id}`}
                                      value={row.designation}
                                      onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                      placeholder={typeDefaultDesignation(row.type)}
                                      disabled={rowReadOnly}
                                      className="w-full bg-transparent border-0 outline-none text-sm"
                                    />
                                    <datalist id={`designation-datalist-${row.id}`}>
                                      <option value={typeDefaultDesignation(row.type)} />
                                    </datalist>
                                  </div>
                                ) : typeUsesDesignationDropdown(row.type) ? (
                                  <select
                                    value={row.designation}
                                    onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                    className="w-full bg-transparent border-0 outline-none text-sm rounded px-1 py-0.5"
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
                                    className="w-full bg-transparent border-0 outline-none text-sm"
                                  />
                                )}
                              </td>
                              <td className="text-center">
                                {rowReadOnly || typeDisablesNbreDinde(row.type) ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {typeDisablesNbreDinde(row.type) ? "—" : formatNbreDisplay(row.nbre_dinde)}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    value={row.nbre_dinde}
                                    onChange={(e) => updateRow(row.id, "nbre_dinde", e.target.value)}
                                    placeholder="—"
                                    min={0}
                                    step={1}
                                    className="w-full min-w-[5rem] tabular-nums text-center"
                                  />
                                )}
                              </td>
                              <td className="min-w-[128px] text-center">
                                {rowReadOnly ? (
                                  <span className="block text-center tabular-nums px-1 py-0.5">
                                    {formatQtyDisplay(row.qte_brute_kg)}
                                  </span>
                                ) : (
                                  <QuantityInput
                                    value={row.qte_brute_kg}
                                    onChange={(value) => updateRow(row.id, "qte_brute_kg", value)}
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
                                    {formatMoneyDisplay(row.prix_kg)}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    value={row.prix_kg}
                                    onChange={(e) => updateRow(row.id, "prix_kg", e.target.value)}
                                    placeholder="—"
                                    step="0.01"
                                    min={0}
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
                              <td className="w-14 max-w-14 shrink-0 !px-1 text-center align-middle">
                                <div className="flex gap-0.5 justify-center">
                                  {row.serverId != null && hasFullAccess && (
                                    <button
                                      type="button"
                                      onClick={() => clearRow(row.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors p-1 inline-flex justify-center items-center rounded hover:bg-red-50"
                                      title="Supprimer la ligne entière"
                                    >
                                      <Eraser className="w-4 h-4" />
                                    </button>
                                  )}
                                  {showDelete && index >= MIN_TABLE_ROWS && (
                                    <button
                                      type="button"
                                      onClick={() => removeRow(row.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors p-1 inline-flex justify-center items-center rounded hover:bg-red-50"
                                      title="Supprimer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {currentRows.length > 0 && (
                          <>
                            <tr className="bg-muted/60">
                              <td
                                colSpan={sortiesFermeTotalRowLabelColSpan()}
                                className="text-sm font-medium text-muted-foreground"
                              >
                                TOTAL {selectedSemaine === VS_SEMAINE ? "(Vide Sanitaire)" : `(${selectedSemaine})`}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(weekTotal.nbre_dinde, 0)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(weekTotal.qte_brute_kg, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap">
                                {formatGroupedNumber(weekTotal.prix_kg, 2)}
                              </td>
                              <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                                {formatGroupedNumber(weekTotal.montant_ttc, 2)}
                              </td>
                              <td />
                              <td />
                            </tr>
                            {selectedSemaine !== VS_SEMAINE && (
                              <tr className="bg-muted/50">
                                <td
                                  colSpan={sortiesFermeTotalRowLabelColSpan()}
                                  className="text-sm font-medium text-muted-foreground"
                                >
                                  CUMUL (Vide sanitaire + semaines)
                                </td>
                                <td className="text-center tabular-nums whitespace-nowrap">
                                  {formatGroupedNumber(cumulForSelectedSemaine.nbre_dinde, 0)}
                                </td>
                                <td className="text-center tabular-nums whitespace-nowrap">
                                  {formatGroupedNumber(cumulForSelectedSemaine.qte_brute_kg, 2)}
                                </td>
                                <td className="text-center tabular-nums whitespace-nowrap">
                                  {formatGroupedNumber(cumulForSelectedSemaine.prix_kg, 2)}
                                </td>
                                <td className="text-center tabular-nums whitespace-nowrap font-semibold">
                                  {formatGroupedNumber(cumulForSelectedSemaine.montant_ttc, 2)}
                                </td>
                                <td />
                                <td />
                              </tr>
                            )}
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
