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
  type EmployerResponse,
  type MainOeuvreResponse,
  type MainOeuvreRequest,
} from "@/lib/api";

/**
 * MAIN D'ŒUVRE
 * Table: Date, Employé (nom complet from employers DB), Temps de travail (1 jour or 1/2 demijour).
 * Permissions: canCreate for add/save, canUpdate for saved rows, canDelete for delete; isReadOnly = consultation seule.
 */

interface MainOeuvreRow {
  id: string;
  serverId?: number;
  date: string;
  employerId: number | null;
  employerNom: string;
  employerPrenom: string;
  fullDay: boolean;
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** Affiche le nom complet : Prénom Nom */
function formatEmployerNomComplet(prenom: string | null | undefined, nom: string | null | undefined): string {
  const p = (prenom ?? "").trim();
  const n = (nom ?? "").trim();
  if (!p && !n) return "—";
  return p && n ? `${p} ${n}` : p || n;
}

function formatTemps(fullDay: boolean | null | undefined): string {
  return fullDay === true ? "1" : fullDay === false ? "1/2" : "—";
}

export default function MainOeuvre() {
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
  const [employers, setEmployers] = useState<EmployerResponse[]>([]);
  const [employersLoading, setEmployersLoading] = useState(false);
  const [rows, setRows] = useState<MainOeuvreRow[]>([]);
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

  useEffect(() => {
    if (showFarmSelector) return;
    setEmployersLoading(true);
    api.employers
      .list()
      .then((list) => setEmployers(list))
      .catch(() => setEmployers([]))
      .finally(() => setEmployersLoading(false));
  }, [showFarmSelector]);

  const selectFarm = useCallback(
    (id: number) => setSearchParams({ farmId: String(id) }),
    [setSearchParams]
  );
  const clearFarmSelection = useCallback(() => setSearchParams({}), [setSearchParams]);

  const emptyRow = (): MainOeuvreRow => ({
    id: crypto.randomUUID(),
    date: today,
    employerId: null,
    employerNom: "",
    employerPrenom: "",
    fullDay: true,
  });

  const loadMovements = useCallback(async () => {
    if (showFarmSelector || !lotFilter.trim()) return;
    setLoading(true);
    try {
      const list = await api.mainOeuvre.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: MainOeuvreRow[] = list.map((r: MainOeuvreResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        date: r.date ?? today,
        employerId: r.employerId ?? null,
        employerNom: r.employerNom ?? "",
        employerPrenom: r.employerPrenom ?? "",
        fullDay: r.fullDay ?? true,
      }));
      if (isReadOnly) {
        setRows(mapped);
      } else {
        const lastDate = mapped.length > 0 ? mapped[mapped.length - 1].date : null;
        const nextDate = lastDate && lastDate.trim() !== "" ? addOneDay(lastDate) : today;
        const newRow: MainOeuvreRow = { ...emptyRow(), date: nextDate };
        setRows(mapped.length ? [...mapped, newRow] : [newRow]);
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger la main d'œuvre.",
        variant: "destructive",
      });
      setRows(canCreate ? [emptyRow()] : []);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, isReadOnly, canCreate, toast, today]);

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
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const nextDate = lastRow?.date?.trim() !== "" ? addOneDay(lastRow.date) : today;
    const newRow: MainOeuvreRow = { ...emptyRow(), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.mainOeuvre
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

  const updateRow = (id: string, field: keyof MainOeuvreRow, value: string | number | boolean | null) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === "employerId") {
          if (value === null || value === "") {
            updated.employerNom = "";
            updated.employerPrenom = "";
          } else {
            const emp = employers.find((e) => e.id === Number(value));
            if (emp) {
              updated.employerNom = emp.nom ?? "";
              updated.employerPrenom = emp.prenom ?? "";
            }
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
    const toSend: MainOeuvreRequest[] = rows
      .filter((r) => r.serverId == null)
      .filter((r) => r.date.trim() !== "" && r.employerId != null)
      .map((r) => ({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || null,
        date: r.date || today,
        employerId: r.employerId ?? undefined,
        fullDay: r.fullDay,
      }));

    if (toSend.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Remplissez la date et choisissez un employé pour chaque ligne nouvelle.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await api.mainOeuvre.createBatch(toSend, pageFarmId ?? undefined);
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

  const colCount = 4; // date, employé, temps, actions

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Main d&apos;œuvre</h1>
        <p>
          Date, employé et temps de travail (1 jour ou 1/2 demijour)
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
              ? "Choisissez une ferme pour consulter la main d'œuvre."
              : "Choisissez une ferme pour consulter et gérer la main d'œuvre."}
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
            Reconnectez-vous et choisissez une ferme pour accéder à la main d&apos;œuvre.
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
            title="Choisir un lot — Main d'œuvre"
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
                <h2 className="text-lg font-display font-bold text-foreground">Main d&apos;œuvre</h2>
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
                      <th className="min-w-[120px]">Date</th>
                      <th className="min-w-[200px]">Employé (nom complet)</th>
                      <th className="min-w-[140px]">Temps de travail</th>
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
                                {rowReadOnly ? (
                                  <span className="text-sm">
                                    {formatEmployerNomComplet(row.employerPrenom, row.employerNom)}
                                  </span>
                                ) : (
                                  <select
                                    value={row.employerId ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      updateRow(row.id, "employerId", v === "" ? null : parseInt(v, 10));
                                    }}
                                    className="w-full min-w-[180px] rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  >
                                    <option value="">— Choisir un employé —</option>
                                    {employers.map((emp) => (
                                      <option key={emp.id} value={emp.id}>
                                        {formatEmployerNomComplet(emp.prenom, emp.nom)}
                                      </option>
                                    ))}
                                    {employers.length === 0 && !employersLoading && (
                                      <option value="" disabled>Aucun employé</option>
                                    )}
                                  </select>
                                )}
                              </td>
                              <td>
                                {rowReadOnly ? (
                                  <span className="text-sm">{formatTemps(row.fullDay)}</span>
                                ) : (
                                  <select
                                    value={row.fullDay ? "1" : "0.5"}
                                    onChange={(e) => updateRow(row.id, "fullDay", e.target.value === "1")}
                                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  >
                                    <option value="1">1 (jour)</option>
                                    <option value="0.5">1/2 (demijour)</option>
                                  </select>
                                )}
                              </td>
                              <td>
                                {showDelete && (
                                  <button
                                    type="button"
                                    onClick={() => removeRow(row.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
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
                              Aucune entrée. {canCreate && "Ajoutez une ligne pour commencer."}
                            </td>
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
