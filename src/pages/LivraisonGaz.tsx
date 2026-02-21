import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Loader2, Plus, Save, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type LivraisonGazResponse,
  type LivraisonGazRequest,
} from "@/lib/api";

/**
 * FICHE DE SUIVI DES LIVRAISONS GAZ
 * Flow: Farm → Lot → Semaine → Table (like Suivi Technique Hebdomadaire / Livraisons Aliment).
 * Each semaine has its own table; TOTAL = current semaine, CUMUL = vide sanitaire + semaines up to current.
 * Vide sanitaire row at top (per lot). Same permission matrix: canCreate/canUpdate/canDelete.
 * Columns: Date, age (semaine), designation, fournisseur, qte, prix, montant, N°BL, N°BR, male, femelle.
 */

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

interface GazRow {
  id: string;
  serverId?: number;
  date: string;
  age: string;
  designation: string;
  supplier: string;
  deliveryNoteNumber: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
  male: string;
  femelle: string;
}

interface VideSanitaireState {
  date: string;
  supplier: string;
  deliveryNoteNumber: string;
  numeroBR: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
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

export default function LivraisonGaz() {
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
  const [rows, setRows] = useState<GazRow[]>([]);
  const [videSanitaire, setVideSanitaire] = useState<VideSanitaireState>(() => ({
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
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSemaineInput, setNewSemaineInput] = useState("");
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
    if (showFarmSelector || !pageFarmId || hasLotInUrl) return;
    setLotsLoading(true);
    api.farms
      .lots(pageFarmId)
      .then((list) => setLots(list ?? []))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, pageFarmId, hasLotInUrl]);

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

  const emptyRow = (age?: string): GazRow => ({
    id: crypto.randomUUID(),
    date: today,
    age: age ?? "",
    designation: "",
    supplier: "",
    deliveryNoteNumber: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
    numeroBR: "",
    male: "",
    femelle: "",
  });

  const loadMovements = useCallback(async () => {
    if (showFarmSelector || !lotFilter.trim()) return;
    setLoading(true);
    try {
      const list = await api.livraisonsGaz.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: GazRow[] = list.map((r: LivraisonGazResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        date: r.date ?? "",
        age: r.age ?? "",
        designation: r.designation ?? "",
        supplier: r.supplier ?? "",
        deliveryNoteNumber: r.deliveryNoteNumber ?? "",
        qte: fromNum(r.qte),
        prixPerUnit: fromNum(r.prixPerUnit),
        montant: fromNum(r.montant),
        numeroBR: r.numeroBR ?? "",
        male: fromNum(r.male),
        femelle: fromNum(r.femelle),
      }));
      setRows(mapped);
      const vsRes = await api.videSanitaireGaz
        .get({ farmId: pageFarmId ?? undefined, lot: lotFilter.trim() || undefined }, undefined)
        .catch(() => undefined);
      if (vsRes) {
        setHasExistingVideSanitaire(true);
        setVideSanitaire({
          date: vsRes.date ?? new Date().toISOString().split("T")[0],
          supplier: vsRes.supplier ?? "",
          deliveryNoteNumber: vsRes.deliveryNoteNumber ?? "",
          numeroBR: vsRes.numeroBR ?? "",
          qte: fromNum(vsRes.qte),
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
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les livraisons gaz.",
        variant: "destructive",
      });
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
  }, [showFarmSelector, pageFarmId, lotFilter, toast]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

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
    const forSem = rows.filter((r) => (r.age || "").trim() === selectedSemaine);
    if (forSem.length >= MIN_TABLE_ROWS) return;
    const toAdd = MIN_TABLE_ROWS - forSem.length;
    setRows((prev) => [...prev, ...Array.from({ length: toAdd }, () => emptyRow(selectedSemaine))]);
  }, [hasSemaineInUrl, selectedSemaine, rows.length]);

  const addRow = () => {
    if (!canCreate || !selectedSemaine) return;
    const currentRows = rows.filter((r) => (r.age || "").trim() === selectedSemaine);
    const lastRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
    const nextDate = lastRow?.date?.trim() ? addOneDay(lastRow.date) : today;
    const newRow = { ...emptyRow(selectedSemaine), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => (r.age || "").trim() === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.livraisonsGaz
        .delete(row.serverId)
        .then(() => loadMovements())
        .catch((e) =>
          toast({
            title: "Erreur",
            description: e instanceof Error ? e.message : "Impossible de supprimer.",
            variant: "destructive",
          })
        );
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof GazRow, value: string) => {
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

  const updateVideSanitaire = (field: keyof VideSanitaireState, value: string) => {
    setVideSanitaire((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "qte" || field === "prixPerUnit") {
        const qte = toNum(updated.qte);
        const prix = toNum(updated.prixPerUnit);
        if (qte >= 0 && prix >= 0) {
          updated.montant = (qte * prix).toFixed(2);
        }
      }
      return updated;
    });
  };

  const rowToRequest = (r: GazRow): LivraisonGazRequest => {
    const qte = r.qte.trim() !== "" ? toNum(r.qte) : null;
    const prix = toNum(r.prixPerUnit);
    const montant = r.montant.trim() !== "" ? toNum(r.montant) : (qte != null && prix >= 0 ? qte * prix : null);
    const male = r.male.trim() !== "" ? toNum(r.male) : null;
    const femelle = r.femelle.trim() !== "" ? toNum(r.femelle) : null;
    return {
      farmId: pageFarmId ?? undefined,
      lot: lotFilter.trim() || null,
      date: r.date || today,
      age: r.age.trim() || null,
      designation: r.designation.trim() || null,
      supplier: r.supplier.trim() || null,
      deliveryNoteNumber: r.deliveryNoteNumber.trim() || null,
      qte: qte ?? null,
      prixPerUnit: prix > 0 ? prix : null,
      montant: montant != null && montant >= 0 ? montant : null,
      numeroBR: r.numeroBR.trim() || null,
      male: male != null && male >= 0 ? Math.round(male) : null,
      femelle: femelle != null && femelle >= 0 ? Math.round(femelle) : null,
    };
  };

  const handleSave = async () => {
    const canSaveNew = canCreate;
    const canSaveExisting = canUpdate;
    if (!canSaveNew && !canSaveExisting) {
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
    const forSem = (r: GazRow) => (r.age || "").trim() === selectedSemaine;
    const toCreate: LivraisonGazRequest[] = canSaveNew
      ? rows.filter((r) => forSem(r) && r.serverId == null).filter((r) => r.date.trim() !== "").map((r) => rowToRequest(r))
      : [];
    const toUpdate = canSaveExisting
      ? rows.filter((r) => forSem(r) && r.serverId != null && r.date.trim() !== "")
      : [];
    const vsHasData = videSanitaire.qte.trim() !== "" || videSanitaire.prixPerUnit.trim() !== "";

    if (toCreate.length === 0 && toUpdate.length === 0 && !(vsHasData && !videSanitaireReadOnly)) {
      toast({
        title: "Aucune ligne à enregistrer",
        description:
          "Remplissez au moins la date pour une ligne nouvelle, modifiez une ligne existante, ou QTE/Prix pour le Vide sanitaire.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map((r) => api.livraisonsGaz.update(r.serverId!, rowToRequest(r))));
      }
      if (vsHasData && !videSanitaireReadOnly) {
        await api.videSanitaireGaz.put(
          {
            farmId: pageFarmId ?? undefined,
            lot: lotFilter.trim() || null,
            date: videSanitaire.date.trim() || null,
            supplier: videSanitaire.supplier.trim() || null,
            deliveryNoteNumber: videSanitaire.deliveryNoteNumber.trim() || null,
            numeroBR: videSanitaire.numeroBR.trim() || null,
            qte: toNum(videSanitaire.qte) || null,
            prixPerUnit: toNum(videSanitaire.prixPerUnit) || null,
          },
          pageFarmId ?? undefined
        );
      }
      if (toCreate.length > 0) {
        await api.livraisonsGaz.createBatch(toCreate, pageFarmId ?? undefined);
      }
      const parts: string[] = [];
      if (toUpdate.length > 0) parts.push(`${toUpdate.length} ligne(s) modifiée(s)`);
      if (vsHasData && !videSanitaireReadOnly) parts.push("Vide sanitaire enregistré");
      if (toCreate.length > 0) parts.push(`${toCreate.length} nouvelle(s) livraison(s)`);
      toast({
        title: "Enregistrement effectué",
        description: parts.join(". "),
      });
      loadMovements();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const currentRows = selectedSemaine ? rows.filter((r) => (r.age || "").trim() === selectedSemaine) : [];
  const videSanitaireTotals = {
    qte: toNum(videSanitaire.qte),
    prix: toNum(videSanitaire.prixPerUnit),
    montant: toNum(videSanitaire.montant),
    male: 0,
    femelle: 0,
  };
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
    let running = { ...videSanitaireTotals };
    const ages = new Set(rows.map((r) => (r.age || "").trim()).filter(Boolean));
    const semOrder = sortSemaines([...ages]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    for (const sem of semsUpTo) {
      const weekRows = rows.filter((r) => (r.age || "").trim() === sem);
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
  const videSanitaireReadOnly = isReadOnly || (hasExistingVideSanitaire && !canUpdate);

  return (
    <AppLayout>
      <div className="page-header">
        <h1>FICHE DE SUIVI DES LIVRAISONS GAZ</h1>
        <p>
          Suivi des livraisons gaz par lot et semaine
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
              ? "Choisissez une ferme pour consulter les livraisons gaz."
              : "Choisissez une ferme pour consulter et gérer les livraisons gaz."}
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
            title="Choisir un lot — Livraisons Gaz"
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
            Choisissez une semaine pour consulter et gérer les livraisons gaz.
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
                <h2 className="text-lg font-display font-bold text-foreground">Livraisons gaz</h2>
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
                      disabled={saving || loading}
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
                      <th className="min-w-[100px]">Date</th>
                      <th className="min-w-[70px]">age</th>
                      <th className="min-w-[180px]">designation</th>
                      <th className="min-w-[120px]">fournisseur</th>
                      <th className="min-w-[70px]">QTE</th>
                      <th className="min-w-[80px]">prix</th>
                      <th className="min-w-[90px]">montant</th>
                      <th className="min-w-[90px]">N°BL</th>
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
                        <tr className="bg-red-500/15 text-foreground">
                          <td>
                            <input
                              type="date"
                              value={videSanitaire.date}
                              onChange={(e) => updateVideSanitaire("date", e.target.value)}
                              disabled={videSanitaireReadOnly}
                              className="bg-transparent border-0 outline-none text-sm w-full"
                            />
                          </td>
                          <td>—</td>
                          <td className="font-medium">Vide sanitaire</td>
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
                              type="number"
                              value={videSanitaire.qte}
                              onChange={(e) => updateVideSanitaire("qte", e.target.value)}
                              placeholder="—"
                              min={0}
                              disabled={videSanitaireReadOnly}
                              className="bg-transparent border-0 outline-none text-sm w-full"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={videSanitaire.prixPerUnit}
                              onChange={(e) => updateVideSanitaire("prixPerUnit", e.target.value)}
                              placeholder="—"
                              step="0.01"
                              min={0}
                              disabled={videSanitaireReadOnly}
                              className="bg-transparent border-0 outline-none text-sm w-full"
                            />
                          </td>
                          <td className="font-semibold text-sm">{videSanitaire.montant || "—"}</td>
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
                          <td>—</td>
                          <td>—</td>
                          <td></td>
                        </tr>
                        {currentRows.map((row) => {
                          const rowReadOnly = isReadOnly || (row.serverId != null && !canUpdate);
                          const showDelete = row.serverId != null ? canDelete : canCreate;
                          return (
                            <tr key={row.id}>
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
                                  value={row.age}
                                  onChange={(e) => updateRow(row.id, "age", e.target.value)}
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
                              <td colSpan={4} className="text-sm font-medium text-muted-foreground">
                                TOTAL {selectedSemaine}
                              </td>
                              <td>{weekTotal.qte}</td>
                              <td>{weekTotal.prix.toFixed(2)}</td>
                              <td>{weekTotal.montant.toFixed(2)}</td>
                              <td>—</td>
                              <td>—</td>
                              <td>{weekTotal.male}</td>
                              <td>{weekTotal.femelle}</td>
                              <td></td>
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={4} className="text-sm font-medium text-muted-foreground">
                                CUMUL
                              </td>
                              <td>{cumulForSelectedSemaine.qte}</td>
                              <td>{cumulForSelectedSemaine.prix.toFixed(2)}</td>
                              <td>{cumulForSelectedSemaine.montant.toFixed(2)}</td>
                              <td>—</td>
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
