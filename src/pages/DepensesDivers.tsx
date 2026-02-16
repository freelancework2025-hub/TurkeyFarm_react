import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Loader2, Plus, Save, Tag, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type DepenseDiversResponse,
  type DepenseDiversRequest,
} from "@/lib/api";

/**
 * DÉPENSES DIVERS
 * Columns: date, age, designation, fournisseur, N°BL, QTE, prix, montant, lot.
 * Same permission matrix as other livraisons: canCreate for add/save, canUpdate for saved rows, canDelete for delete.
 */

interface DepenseDiversRow {
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
  lot: string;
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function fromNum(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

function rowIndexToAge(rowIndex1Based: number): string {
  const semNum = Math.ceil(rowIndex1Based / 7);
  return `S${semNum}`;
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export default function DepensesDivers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);

  const { canAccessAllFarms, isReadOnly, canCreate, canUpdate, canDelete, selectedFarmId: authSelectedFarmId } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [rows, setRows] = useState<DepenseDiversRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const hasLotInUrl = lotParam.trim() !== "";
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
    if (showFarmSelector || !pageFarmId || hasLotInUrl) return;
    setLotsLoading(true);
    api.farms
      .lots(pageFarmId)
      .then((list) => setLots(Array.isArray(list) ? list : []))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, pageFarmId, hasLotInUrl]);

  const selectFarm = useCallback(
    (id: number) => setSearchParams({ farmId: String(id) }),
    [setSearchParams]
  );
  const clearFarmSelection = useCallback(() => setSearchParams({}), [setSearchParams]);

  const emptyRow = (): DepenseDiversRow => ({
    id: crypto.randomUUID(),
    date: today,
    age: "",
    designation: "",
    supplier: "",
    deliveryNoteNumber: "",
    qte: "",
    prixPerUnit: "",
    montant: "",
    lot: "",
  });

  const loadMovements = useCallback(async () => {
    if (showFarmSelector || !lotFilter.trim()) return;
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
        age: r.age ?? "",
        designation: r.designation ?? "",
        supplier: r.supplier ?? "",
        deliveryNoteNumber: r.deliveryNoteNumber ?? "",
        qte: fromNum(r.qte),
        prixPerUnit: fromNum(r.prixPerUnit),
        montant: fromNum(r.montant),
        lot: r.lot ?? "",
      }));
      if (isReadOnly) {
        setRows(mapped);
      } else {
        const nextRowIndex = mapped.length + 1;
        const age = rowIndexToAge(nextRowIndex);
        const lastDate = mapped.length > 0 ? mapped[mapped.length - 1].date : null;
        const nextDate = lastDate && lastDate.trim() !== "" ? addOneDay(lastDate) : today;
        const newRow = { ...emptyRow(), date: nextDate, age };
        setRows(mapped.length ? [...mapped, newRow] : [newRow]);
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les dépenses divers.",
        variant: "destructive",
      });
      setRows(canCreate ? [emptyRow()] : []);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, isReadOnly, canCreate, toast]);

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
    setSearchParams(params, { replace: true });
  }, [selectedFarmId, lotFilter, setSearchParams]);

  const addRow = () => {
    if (!canCreate) return;
    const nextRowIndex = rows.length + 1;
    const age = rowIndexToAge(nextRowIndex);
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const nextDate = lastRow?.date?.trim() !== "" ? addOneDay(lastRow.date) : today;
    const newRow = { ...emptyRow(), date: nextDate, age };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.depensesDivers
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

  const handleSave = async () => {
    if (!canCreate) {
      toast({
        title: "Non autorisé",
        description: "Vous ne pouvez pas enregistrer les données.",
        variant: "destructive",
      });
      return;
    }
    if (!lotFilter.trim()) {
      toast({
        title: "Lot requis",
        description: "Indiquez le numéro de lot en haut de la page avant d'enregistrer.",
        variant: "destructive",
      });
      return;
    }
    const toSend: DepenseDiversRequest[] = rows
      .filter((r) => r.serverId == null)
      .filter((r) => r.date.trim() !== "")
      .map((r) => {
        const qte = r.qte.trim() !== "" ? toNum(r.qte) : null;
        const prix = toNum(r.prixPerUnit);
        const montant =
          r.montant.trim() !== ""
            ? toNum(r.montant)
            : qte != null && prix >= 0
              ? qte * prix
              : null;
        return {
          farmId: pageFarmId ?? undefined,
          lot: r.lot.trim() || lotFilter.trim() || null,
          date: r.date || today,
          age: r.age.trim() || null,
          designation: r.designation.trim() || null,
          supplier: r.supplier.trim() || null,
          deliveryNoteNumber: r.deliveryNoteNumber.trim() || null,
          qte: qte ?? null,
          prixPerUnit: prix > 0 ? prix : null,
          montant: montant != null && montant >= 0 ? montant : null,
        };
      });

    if (toSend.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Remplissez au moins la date pour une ligne nouvelle.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await api.depensesDivers.createBatch(toSend, pageFarmId ?? undefined);
      toast({
        title: "Enregistrement effectué",
        description: `${toSend.length} ligne(s) enregistrée(s).`,
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

  const totalMontant = rows.reduce((acc, r) => acc + toNum(r.montant), 0);
  const colCount = 10; // date, age, designation, fournisseur, N°BL, QTE, prix, montant, lot, actions

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Dépenses divers</h1>
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
            title="Choisir un lot — Dépenses divers"
          />
        </>
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
          <div className="space-y-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span>LOT N°</span>
                <input
                  type="text"
                  value={lotFilter}
                  onChange={(e) => setLotFilter(e.target.value)}
                  placeholder="—"
                  disabled={lotReadOnly}
                  readOnly={lotReadOnly}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </label>
              {lotReadOnly && (
                <span className="text-xs text-muted-foreground">(non modifiable après enregistrement)</span>
              )}
              <button
                type="button"
                onClick={() => setSearchParams(selectedFarmId != null ? { farmId: String(selectedFarmId) } : {})}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Changer de lot
              </button>
            </div>
          </div>

          <div className="space-y-6 w-full min-w-0">
            <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
                <h2 className="text-lg font-display font-bold text-foreground">Dépenses divers</h2>
                {canCreate && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addRow}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <Plus className="w-4 h-4" /> Ligne
                    </button>
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
                      <th className="min-w-[70px]">Âge</th>
                      <th className="min-w-[140px]">Désignation</th>
                      <th className="min-w-[120px]">Fournisseur</th>
                      <th className="min-w-[90px]">N°BL</th>
                      <th className="min-w-[80px]">QTE</th>
                      <th className="min-w-[80px]">Prix</th>
                      <th className="min-w-[90px]">Montant</th>
                      <th className="min-w-[80px]">Lot</th>
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
                        {rows.map((row) => {
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
                                  className="bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.age}
                                  onChange={(e) => updateRow(row.id, "age", e.target.value)}
                                  placeholder="S1"
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
                                  type="number"
                                  value={row.qte}
                                  onChange={(e) => updateRow(row.id, "qte", e.target.value)}
                                  placeholder="—"
                                  min={0}
                                  step="0.01"
                                  disabled={rowReadOnly}
                                  className="bg-transparent border-0 outline-none text-sm w-full"
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
                                  className="bg-transparent border-0 outline-none text-sm w-full"
                                />
                              </td>
                              <td className="font-semibold text-sm">{row.montant || "—"}</td>
                              <td>
                                <input
                                  type="text"
                                  value={row.lot}
                                  onChange={(e) => updateRow(row.id, "lot", e.target.value)}
                                  placeholder="—"
                                  disabled={rowReadOnly}
                                  className="w-full min-w-0 bg-transparent border-0 outline-none text-sm"
                                />
                              </td>
                              <td>
                                {showDelete && (
                                  <button
                                    type="button"
                                    onClick={() => removeRow(row.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                    disabled={rows.length <= 1}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {rows.length === 0 && !loading && (
                          <tr>
                            <td colSpan={colCount} className="p-8 text-center text-muted-foreground">
                              Aucune dépense. {canCreate && "Ajoutez une ligne pour commencer."}
                            </td>
                          </tr>
                        )}
                        {rows.length > 0 && (
                          <tr className="bg-muted/60">
                            <td colSpan={7} className="text-sm font-medium text-muted-foreground">
                              TOTAL
                            </td>
                            <td className="font-semibold text-sm">{totalMontant.toFixed(2)}</td>
                            <td colSpan={2}></td>
                          </tr>
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
