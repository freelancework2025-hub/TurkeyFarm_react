import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Save, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type FournisseurGridResponse,
  type FournisseurGridRequest,
} from "@/lib/api";

/**
 * Permission matrix:
 * - ADMINISTRATEUR / RESPONSABLE_TECHNIQUE: full CRUD; can add/remove/modify any fournisseur columns,
 *   designation rows, or price cells; can delete any saved data.
 * - BACKOFFICE_EMPLOYER: read-only (isReadOnly); no add/save/remove.
 * - RESPONSABLE_FERME: can add new fournisseur columns and fill them, add new designation rows, and save.
 *   Once a fournisseur or a designation row has saved data, they cannot modify or delete it; they can only
 *   add further columns or rows and save again.
 */

interface FournisseurCol {
  id: string;
  serverId?: number;
  name: string;
}

const DEFAULT_DESIGNATIONS = [
  "DC.DEM.0-21.MI EN SAC",
  "DC.DEM.0-21.MI EN VRAC",
  "DC.CRS.22-35.GM EN VRAC",
  "DC.CRS.36-56.GR EN VRAC",
  "DC.FIN.57-70.GR EN VRAC",
  "DC.FIN.71-91.GR EN VRAC",
  "DC.FIN.92-105.GR EN VRAC",
  "DC.FIN.106-140.GR EN VRAC",
];

export default function Fournisseurs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);

  const { canAccessAllFarms, isReadOnly, canCreate, canDelete, canUpdate } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : undefined;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [fournisseurs, setFournisseurs] = useState<FournisseurCol[]>([]);
  const [designations, setDesignations] = useState<string[]>(DEFAULT_DESIGNATIONS);
  /** Keys "desIdx|colId" for cells that have saved data; RESPONSABLE_FERME / backoffice cannot edit these (but can fill new columns in any row). */
  const [savedCellKeys, setSavedCellKeys] = useState<Set<string>>(new Set());
  /** Number of designation rows from server at last load/save; rows with index >= this can be removed before save. */
  const [serverDesignationCount, setServerDesignationCount] = useState(8);
  const [newDesignation, setNewDesignation] = useState("");
  const [prices, setPrices] = useState<Record<number, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadGrid = useCallback(async () => {
    if (showFarmSelector) return;
    setLoading(true);
    try {
      const grid = await api.fournisseurs.getGrid(pageFarmId ?? undefined);
      const cols: FournisseurCol[] = (grid.fournisseurs ?? []).map((f) => ({
        id: `f${f.id}`,
        serverId: f.id,
        name: f.name,
      }));
      const serverDes = grid.designations ?? [];
      const des = serverDes.length >= 8 ? serverDes : DEFAULT_DESIGNATIONS;
      const priceMap: Record<number, Record<string, string>> = {};
      const cellKeys = new Set<string>();
      for (const row of grid.prices ?? []) {
        const desIdx = des.indexOf(row.designation);
        if (desIdx === -1) continue;
        const col = cols.find((c) => c.serverId === row.fournisseurId);
        if (!col) continue;
        if (!priceMap[desIdx]) priceMap[desIdx] = {};
        priceMap[desIdx][col.id] =
          row.price_kg != null ? String(row.price_kg) : "";
        if (row.price_kg != null) cellKeys.add(`${desIdx}|${col.id}`);
      }
      setFournisseurs(cols.length ? cols : [{ id: crypto.randomUUID(), name: "Fournisseur A" }]);
      setDesignations(des);
      setSavedCellKeys(cellKeys);
      setServerDesignationCount(des.length);
      setPrices(priceMap);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger la grille.",
        variant: "destructive",
      });
      setFournisseurs([{ id: crypto.randomUUID(), name: "Fournisseur A" }]);
      setDesignations(DEFAULT_DESIGNATIONS);
      setSavedCellKeys(new Set());
      setServerDesignationCount(DEFAULT_DESIGNATIONS.length);
      setPrices({});
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, toast]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  useEffect(() => {
    if (!showFarmSelector) return;
    setFarmsLoading(true);
    api.farms
      .list()
      .then((list) => setFarms(list))
      .catch(() => setFarms([]))
      .finally(() => setFarmsLoading(false));
  }, [showFarmSelector]);

  const selectFarm = useCallback(
    (id: number) => setSearchParams({ farmId: String(id) }),
    [setSearchParams]
  );
  const clearFarmSelection = useCallback(() => setSearchParams({}), [setSearchParams]);

  const updatePrice = (desIdx: number, fId: string, val: string) => {
    setPrices((prev) => ({
      ...prev,
      [desIdx]: { ...(prev[desIdx] || {}), [fId]: val },
    }));
  };

  const addFournisseur = () => {
    if (!canCreate) return;
    setFournisseurs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Fournisseur ${String.fromCharCode(65 + prev.length)}`,
      },
    ]);
  };

  const removeFournisseur = (id: string) => {
    if (fournisseurs.length <= 1) return;
    const col = fournisseurs.find((f) => f.id === id);
    if (col?.serverId != null && !canDelete) return;
    setFournisseurs((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFournisseurName = (id: string, name: string) => {
    setFournisseurs((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const addDesignation = () => {
    if (!canCreate) return;
    if (newDesignation.trim()) {
      setDesignations((prev) => [...prev, newDesignation.trim()]);
      setNewDesignation("");
    }
  };

  /** Remove an unsaved designation row (only rows added in this session, index >= serverDesignationCount). */
  const removeDesignation = (idx: number) => {
    if (!canCreate || idx < serverDesignationCount || designations.length <= 8) return;
    setDesignations((prev) => prev.filter((_, i) => i !== idx));
    setPrices((prev) => {
      const next: Record<number, Record<string, string>> = {};
      for (const d of Object.keys(prev)) {
        const i = Number(d);
        if (i < idx) next[i] = prev[i];
        if (i > idx) next[i - 1] = prev[i];
      }
      return next;
    });
    setSavedCellKeys((prev) => {
      const next = new Set<string>();
      for (const k of prev) {
        const [desIdxStr, colId] = k.split("|");
        const i = Number(desIdxStr);
        if (i < idx) next.add(k);
        if (i > idx) next.add(`${i - 1}|${colId}`);
      }
      return next;
    });
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
    // Send full grid so empty cells are not "deleted" — they stay empty until user fills and saves
    const body: FournisseurGridRequest = {
      fournisseurs: fournisseurs.map((f) => ({
        id: f.serverId ?? undefined,
        name: f.name,
      })),
      designations,
      prices: [],
    };
    for (let desIdx = 0; desIdx < designations.length; desIdx++) {
      for (let fi = 0; fi < fournisseurs.length; fi++) {
        const f = fournisseurs[fi];
        const val = prices[desIdx]?.[f.id];
        const num =
          val != null && val.trim() !== ""
            ? parseFloat(val)
            : Number.NaN;
        body.prices.push({
          fournisseur_index: fi,
          designation_index: desIdx,
          price_kg: Number.isNaN(num) ? null : num,
        });
      }
    }
    setSaving(true);
    try {
      const grid = await api.fournisseurs.saveGrid(body, pageFarmId ?? undefined);
      const cols: FournisseurCol[] = (grid.fournisseurs ?? []).map((f) => ({
        id: `f${f.id}`,
        serverId: f.id,
        name: f.name,
      }));
      const serverDes = grid.designations ?? [];
      const des = serverDes.length >= 8 ? serverDes : DEFAULT_DESIGNATIONS;
      const priceMap: Record<number, Record<string, string>> = {};
      const cellKeys = new Set<string>();
      for (const row of grid.prices ?? []) {
        const desIdx = des.indexOf(row.designation);
        if (desIdx === -1) continue;
        const col = cols.find((c) => c.serverId === row.fournisseurId);
        if (!col) continue;
        if (!priceMap[desIdx]) priceMap[desIdx] = {};
        priceMap[desIdx][col.id] =
          row.price_kg != null ? String(row.price_kg) : "";
        if (row.price_kg != null) cellKeys.add(`${desIdx}|${col.id}`);
      }
      setFournisseurs(cols.length ? cols : [{ id: crypto.randomUUID(), name: "Fournisseur A" }]);
      setDesignations(des);
      setSavedCellKeys(cellKeys);
      setServerDesignationCount(des.length);
      setPrices(priceMap);
      toast({ title: "Grille enregistrée", description: "Prix d'aliment mis à jour." });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer la grille.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Fournisseurs — Prix d'Aliment</h1>
        <p>
          Grille comparative des prix d'aliment par fournisseur et désignation
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
              ? "Choisissez une ferme pour consulter les prix d'aliment. Vous pouvez changer de ferme sans vous déconnecter."
              : "Choisissez une ferme pour consulter et gérer les prix d'aliment. Vous pouvez changer de ferme sans vous déconnecter."}
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

          <div className="space-y-6 w-full min-w-0">
            <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
                <h2 className="text-lg font-display font-bold text-foreground">
                  Prix d'Aliment
                </h2>
                {canCreate && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addFournisseur}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <Plus className="w-4 h-4" /> Fournisseur
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

              {loading ? (
                <div className="p-12 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Chargement…</span>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="table-farm">
                      <thead>
                        <tr>
                          <th className="min-w-[250px]">Désignation</th>
                          {fournisseurs.map((f) => (
                            <th key={f.id} className="min-w-[150px]">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={f.name}
                                  onChange={(e) => updateFournisseurName(f.id, e.target.value)}
                                  className="bg-transparent border-0 outline-none text-primary-foreground font-semibold text-xs w-full focus:bg-transparent"
                                  disabled={isReadOnly || (f.serverId != null && !canUpdate)}
                                  title={f.serverId != null && !canUpdate ? "Modification non autorisée" : undefined}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFournisseur(f.id)}
                                  className="text-primary-foreground/60 hover:text-primary-foreground disabled:opacity-50"
                                  disabled={isReadOnly || fournisseurs.length <= 1 || (f.serverId != null && !canDelete)}
                                  title={f.serverId != null && !canDelete ? "Suppression non autorisée" : undefined}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {designations.map((des, idx) => (
                          <tr key={`${idx}-${des}`}>
                            <td className="font-medium text-sm">
                              <div className="flex items-center gap-1.5">
                                <span className="min-w-0 truncate">{des}</span>
                                {canCreate &&
                                  idx >= serverDesignationCount &&
                                  designations.length > 8 && (
                                    <button
                                      type="button"
                                      onClick={() => removeDesignation(idx)}
                                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                                      title="Supprimer cette ligne (non enregistrée)"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                              </div>
                            </td>
                            {fournisseurs.map((f) => (
                              <td key={f.id}>
                                <input
                                  type="number"
                                  value={prices[idx]?.[f.id] || ""}
                                  onChange={(e) => updatePrice(idx, f.id, e.target.value)}
                                  placeholder="0.00"
                                  step="0.01"
                                  disabled={isReadOnly || (!canUpdate && savedCellKeys.has(`${idx}|${f.id}`))}
                                  title={!canUpdate && savedCellKeys.has(`${idx}|${f.id}`) ? "Cellule enregistrée : modification non autorisée" : undefined}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {canCreate && (
                    <div className="px-5 py-3 border-t border-border flex items-center gap-2">
                      <input
                        type="text"
                        value={newDesignation}
                        onChange={(e) => setNewDesignation(e.target.value)}
                        placeholder="Nouvelle désignation..."
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        onKeyDown={(e) => e.key === "Enter" && addDesignation()}
                      />
                      <button
                        type="button"
                        onClick={addDesignation}
                        className="flex items-center gap-1.5 px-3 py-2 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        <Plus className="w-4 h-4" /> Ajouter Ligne
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
