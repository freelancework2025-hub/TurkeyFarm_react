import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Save, Tag, Trash2, Calendar } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type LivraisonAlimentResponse,
  type LivraisonAlimentRequest,
} from "@/lib/api";

/**
 * FICHE DE SUIVI DES LIVRAISONS D'ALIMENT
 * Flow: Farm → Lot → Semaine → Table (like Suivi Technique Hebdomadaire).
 * Each semaine has its own table and total; cumul = sum of previous semaines + current.
 * The total quantity per week (per farm/lot) feeds Stock Aliment in Suivi Technique Hebdomadaire:
 * stock is shared across all batiments (B1 then B2 then B3…), and the next week = rest of previous week + livraisons.
 * Rule: B1 = Stock_prev + Livraisons_sexe − Stock_actuel. B2+ = Stock_transfer − Stock_actuel
 * (Stock_transfer = stock du dernier bâtiment actif du même sexe dans la semaine). CUMUL = 0 jusqu'à calcul.
 * Permission matrix: same as Sorties — canCreate for add/save, canUpdate for saved rows, canDelete for delete.
 * RESPONSABLE_FERME: can add and save new rows; saved rows are read-only (no update/delete).
 * DAY-BY-DAY FLOW: Each row = one day. User fills day 1 → clicks Enregistrer → day 1 saved and locked.
 * Then fills day 2 → Enregistrer → day 2 locked. Only the first unsaved row is editable at a time.
 */

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

interface LivraisonRow {
  id: string;
  serverId?: number;
  age: string;
  date: string;
  sem: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  qte: string;
  sex: string;
  prixPerUnit: string;
  montant: string;
  maleQty: string;
  femaleQty: string;
  movementType: string;
  notes: string;
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
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

/** Sort semaines: S1, S2, ... S24, then custom (e.g. S25). */
function sortSemaines(sems: string[]): string[] {
  return [...sems].sort((a, b) => {
    const numA = parseInt(a.replace(/^S(\d+)$/i, "$1"), 10);
    const numB = parseInt(b.replace(/^S(\d+)$/i, "$1"), 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    if (!Number.isNaN(numA)) return -1;
    if (!Number.isNaN(numB)) return 1;
    return a.localeCompare(b);
  });
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

export default function LivraisonsAliment() {
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
  const [newSemaineInput, setNewSemaineInput] = useState("");

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [rows, setRows] = useState<LivraisonRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previousLotLastDate, setPreviousLotLastDate] = useState<string | null>(null);
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const hasSavedData = rows.some((r) => r.serverId != null);
  const lotReadOnly = hasSavedData;

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
      .lots(pageFarmId)
      .then((list) => setLots(list ?? []))
      .catch(() => setLots([]))
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

  const emptyRow = (sem?: string, overrideDate?: string): LivraisonRow => ({
    id: crypto.randomUUID(),
    age: "",
    date: overrideDate ?? today,
    sem: sem ?? "",
    designation: "",
    supplier: "",
    deliveryNoteNumber: "",
    qte: "",
    sex: "",
    prixPerUnit: "",
    montant: "",
    maleQty: "",
    femaleQty: "",
    movementType: "DELIVERY",
    notes: "",
  });

  /** Start date for a semaine: S2 = last day of S1 + 1; first semaine of lot = previous lot last day + 1 (or today). */
  const getStartDateForSemaine = useCallback(
    (semaine: string): string => {
      const sems = new Set(rows.map((r) => (r.sem || "").trim()).filter(Boolean));
      sems.add(semaine.trim());
      const semOrder = sortSemaines([...sems]);
      const idx = semOrder.indexOf(semaine.trim());
      if (idx < 0) return today;
      if (idx === 0) return previousLotLastDate ?? today;
      const prevSem = semOrder[idx - 1];
      const prevRows = rows.filter((r) => (r.sem || "").trim() === prevSem);
      if (prevRows.length === 0) return today;
      const dates = prevRows.map((r) => r.date).filter((d) => d?.trim());
      if (dates.length === 0) return today;
      const maxD = dates.sort()[dates.length - 1];
      return maxD ? addOneDay(maxD) : today;
    },
    [rows, previousLotLastDate]
  );

  const loadMovements = useCallback(async () => {
    if (showFarmSelector || !lotFilter.trim()) return;
    setLoading(true);
    try {
      const list = await api.livraisonsAliment.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: LivraisonRow[] = list.map((r: LivraisonAlimentResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        age: r.age != null ? String(r.age) : "",
        date: r.date ?? "",
        sem: r.sem ?? "",
        designation: r.designation ?? "",
        supplier: r.supplier ?? "",
        deliveryNoteNumber: r.deliveryNoteNumber ?? "",
        qte: fromNum(r.qte),
        sex: r.sex ?? "",
        prixPerUnit: fromNum(r.prixPerUnit),
        montant: fromNum(r.montant),
        maleQty: fromNum(r.maleQty),
        femaleQty: fromNum(r.femaleQty),
        movementType: r.movementType ?? "DELIVERY",
        notes: r.notes ?? "",
      }));
      
      // Ensure MIN_TABLE_ROWS for the selected semaine (if semaine is selected)
      if (hasSemaineInUrl && selectedSemaine) {
        const forSem = mapped.filter((r) => (r.sem || "").trim() === selectedSemaine);
        if (isReadOnly) {
          // Read-only: show only what exists
          setRows(mapped);
        } else if (forSem.length >= MIN_TABLE_ROWS) {
          // Already have enough rows for this semaine
          setRows(mapped);
        } else {
          // Need to add empty rows to reach MIN_TABLE_ROWS
          const toAdd = MIN_TABLE_ROWS - forSem.length;
          // Calculate start date inline to avoid circular dependency
          const startDate = forSem.length > 0
            ? (() => {
                const dates = forSem.map((r) => r.date).filter((d) => d?.trim());
                if (dates.length === 0) return previousLotLastDate ?? today;
                const maxD = dates.sort()[dates.length - 1];
                return addOneDay(maxD);
              })()
            : previousLotLastDate ?? today;
          const newRows: LivraisonRow[] = [];
          let nextDate = startDate;
          for (let i = 0; i < toAdd; i++) {
            newRows.push(emptyRow(selectedSemaine, nextDate));
            nextDate = addOneDay(nextDate);
          }
          setRows([...mapped, ...newRows]);
        }
      } else {
        setRows(mapped);
      }
    } catch {
      if (hasSemaineInUrl && selectedSemaine && canCreate) {
        // On error, create MIN_TABLE_ROWS empty rows for the selected semaine
        const startDate = previousLotLastDate ?? today;
        const newRows: LivraisonRow[] = [];
        let nextDate = startDate;
        for (let i = 0; i < MIN_TABLE_ROWS; i++) {
          newRows.push(emptyRow(selectedSemaine, nextDate));
          nextDate = addOneDay(nextDate);
        }
        setRows(newRows);
      } else {
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, toast, hasSemaineInUrl, selectedSemaine, isReadOnly, canCreate, previousLotLastDate, today]);

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
    api.livraisonsAliment
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

  const addRow = () => {
    if (!canCreate || !selectedSemaine) return;
    const currentRows = rows.filter((r) => (r.sem || "").trim() === selectedSemaine);
    const lastRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
    const nextDate =
      lastRow?.date?.trim() ? addOneDay(lastRow.date) : getStartDateForSemaine(selectedSemaine);
    const newRow = { ...emptyRow(selectedSemaine), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => (r.sem || "").trim() === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.livraisonsAliment
        .delete(row.serverId)
        .then(() => loadMovements())
        .catch(() => { /* API error — logged in backend only */ });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof LivraisonRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // QTE is user-entered aliment quantity only; montant = qte * prix
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

  /** Build request DTO from a row (for both create and update). */
  const rowToRequest = (r: LivraisonRow): LivraisonAlimentRequest => {
    const male = toNum(r.maleQty);
    const female = toNum(r.femaleQty);
    const qte = r.qte.trim() !== "" ? toNum(r.qte) : null;
    const prix = toNum(r.prixPerUnit);
    const montant = r.montant.trim() !== "" ? toNum(r.montant) : (qte != null && prix >= 0 ? qte * prix : null);
    // sem required for consumption calc; fallback to selectedSemaine when row.sem is empty
    const sem = (r.sem || "").trim() || selectedSemaine || null;
    return {
      farmId: pageFarmId ?? undefined,
      lot: lotFilter.trim() || null,
      date: r.date || today,
      age: r.age.trim() !== "" ? parseInt(r.age, 10) : null,
      sem,
      designation: r.designation.trim() || null,
      supplier: r.supplier.trim() || null,
      deliveryNoteNumber: r.deliveryNoteNumber.trim() || null,
      qte: qte ?? null,
      sex: r.sex.trim() !== "" ? r.sex.trim() : null,
      maleQty: male > 0 ? male : null,
      femaleQty: female > 0 ? female : null,
      prixPerUnit: prix > 0 ? prix : null,
      montant: montant != null && montant >= 0 ? montant : null,
      movementType: r.movementType || "DELIVERY",
      notes: r.notes.trim() || null,
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

    const forSem = (r: LivraisonRow) => (r.sem || "").trim() === selectedSemaine;
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
      await api.livraisonsAliment.createBatch(
        [rowToRequest(firstUnsaved)],
        pageFarmId ?? undefined
      );
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

  /** Rows for the selected semaine only; sorted by date (day 1, day 2, ...). */
  const currentRows = selectedSemaine
    ? [...rows.filter((r) => (r.sem || "").trim() === selectedSemaine)].sort(
        (a, b) => (a.date || "").localeCompare(b.date || "")
      )
    : [];

  /** Index of the first unsaved row (day-by-day: only this row is editable). */
  const firstEditableRowIndex = currentRows.findIndex((r) => r.serverId == null);

  /** Total for current semaine only. */
  const weekTotal = (() => {
    const t = { qte: 0, prix: 0, montant: 0, maleQty: 0, femaleQty: 0 };
    for (const r of currentRows) {
      t.qte += toNum(r.qte);
      t.prix += toNum(r.prixPerUnit);
      t.montant += toNum(r.montant);
      t.maleQty += toNum(r.maleQty);
      t.femaleQty += toNum(r.femaleQty);
    }
    return t;
  })();

  /** Cumul = sum of totals of all semaines up to and including selectedSemaine (ordered S1, S2, ...). */
  const cumulForSelectedSemaine = (() => {
    const sems = new Set(rows.map((r) => (r.sem || "").trim()).filter(Boolean));
    const semOrder = sortSemaines([...sems]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    let running = { qte: 0, prix: 0, montant: 0, maleQty: 0, femaleQty: 0 };
    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => (r.sem || "").trim() === sem);
      for (const r of weekRows) {
        running.qte += toNum(r.qte);
        running.prix += toNum(r.prixPerUnit);
        running.montant += toNum(r.montant);
        running.maleQty += toNum(r.maleQty);
        running.femaleQty += toNum(r.femaleQty);
      }
    }
    return running;
  })();

  return (
    <AppLayout>
      <div className="page-header">
        <h1>FICHE DE SUIVI DES LIVRAISONS D'ALIMENT</h1>
        <p>
          Suivi des livraisons et mouvements d'aliment par lot et semaine
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
              ? "Choisissez une ferme pour consulter les livraisons d'aliment."
              : "Choisissez une ferme pour consulter et gérer les livraisons d'aliment."}
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
      ) : !hasLotInUrl ? (
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
          <LotSelectorView
            existingLots={lots}
            loading={lotsLoading}
            onSelectLot={(lot) => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId), lot } : { lot })}
            onNewLot={(lot) => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId), lot } : { lot })}
            canCreate={canCreate}
            title="Choisir un lot — Livraisons Aliment"
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
            Choisissez une semaine pour consulter et gérer les livraisons d'aliment.
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
                    Livraisons d'aliment
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
                      <th className="min-w-[70px]">AGE</th>
                      <th className="min-w-[100px]">DATE</th>
                      <th className="min-w-[60px]">SEM</th>
                      <th className="min-w-[180px]">DÉSIGNATION</th>
                      <th className="min-w-[120px]">FOURNISSEUR</th>
                      <th className="min-w-[90px]">N° BL</th>
                      <th className="min-w-[70px]">QTE</th>
                      <th className="min-w-[80px]">SEX</th>
                      <th className="min-w-[80px]">PRIX</th>
                      <th className="min-w-[90px]">MONTANT</th>
                      <th className="min-w-[70px]" title="Qté livrée pour Mâle — alimente CONSOMMATION ALIMENT du Mâle">MALE</th>
                      <th className="min-w-[80px]" title="Qté livrée pour Femelle — alimente CONSOMMATION ALIMENT de la Femelle">FEMELLE</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-muted-foreground">
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
                              <td>
                                <input
                                  type="text"
                                  value={row.age}
                                  onChange={(e) => updateRow(row.id, "age", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  value={row.date}
                                  onChange={(e) => updateRow(row.id, "date", e.target.value)}
                                  disabled={rowReadOnly}
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
                                  type="number"
                                  value={row.qte}
                                  onChange={(e) => updateRow(row.id, "qte", e.target.value)}
                                  placeholder="—"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td>
                                <select
                                  value={row.sex}
                                  onChange={(e) => updateRow(row.id, "sex", e.target.value)}
                                  disabled={rowReadOnly}
                                  className="w-full min-w-[70px] bg-transparent border-0 outline-none text-sm rounded px-1 py-0.5"
                                >
                                  <option value="">—</option>
                                  <option value="MALE">Male</option>
                                  <option value="FEMELLE">Femelle</option>
                                </select>
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
                                  type="number"
                                  value={row.maleQty}
                                  onChange={(e) => updateRow(row.id, "maleQty", e.target.value)}
                                  placeholder="0"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={row.femaleQty}
                                  onChange={(e) => updateRow(row.id, "femaleQty", e.target.value)}
                                  placeholder="0"
                                  min={0}
                                  disabled={rowReadOnly}
                                />
                              </td>
                              <td>
                                {showDelete && (
                                  <button
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
                        <tr className="bg-muted/60">
                          <td colSpan={5} className="text-sm font-medium text-muted-foreground">
                            TOTAL {selectedSemaine}
                          </td>
                          <td>—</td>
                          <td>{weekTotal.qte}</td>
                          <td>—</td>
                          <td>{weekTotal.prix.toFixed(2)}</td>
                          <td>{weekTotal.montant.toFixed(2)}</td>
                          <td>{weekTotal.maleQty}</td>
                          <td>{weekTotal.femaleQty}</td>
                          <td></td>
                        </tr>
                        <tr className="bg-muted/50">
                          <td colSpan={5} className="text-sm font-medium text-muted-foreground">
                            CUMUL
                          </td>
                          <td>—</td>
                          <td>{cumulForSelectedSemaine.qte}</td>
                          <td>—</td>
                          <td>{cumulForSelectedSemaine.prix.toFixed(2)}</td>
                          <td>{cumulForSelectedSemaine.montant.toFixed(2)}</td>
                          <td>{cumulForSelectedSemaine.maleQty}</td>
                          <td>{cumulForSelectedSemaine.femaleQty}</td>
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
