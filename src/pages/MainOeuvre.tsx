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
  type EmployerResponse,
  type MainOeuvreResponse,
  type MainOeuvreRequest,
} from "@/lib/api";

/**
 * MAIN D'ŒUVRE
 * Flow: Farm → Lot → Semaine → Table (like Suivi Technique Hebdomadaire / Livraisons Aliment).
 * Each semaine has its own table; TOTAL = jours for current semaine, CUMUL = running jours.
 * Table: Date, Semaine (age), Employé, Temps (1 jour or 1/2 demijour). Permissions: canCreate/canUpdate/canDelete.
 */

const SEMAINES = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const MIN_TABLE_ROWS = 7;

interface MainOeuvreRow {
  id: string;
  serverId?: number;
  date: string;
  age: string;
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

/** Jours for one row: 1 if fullDay, 0.5 otherwise */
function rowJours(fullDay: boolean): number {
  return fullDay ? 1 : 0.5;
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

export default function MainOeuvre() {
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
  const [employers, setEmployers] = useState<EmployerResponse[]>([]);
  const [employersLoading, setEmployersLoading] = useState(false);
  const [rows, setRows] = useState<MainOeuvreRow[]>([]);
  const [lotFilter, setLotFilter] = useState(lotParam);
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

  const emptyRow = (age?: string): MainOeuvreRow => ({
    id: crypto.randomUUID(),
    date: today,
    age: age ?? "",
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
        age: r.age ?? "",
        employerId: r.employerId ?? null,
        employerNom: r.employerNom ?? "",
        employerPrenom: r.employerPrenom ?? "",
        fullDay: r.fullDay ?? true,
      }));
      setRows(mapped);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger la main d'œuvre.",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, lotFilter, toast, today]);

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
    const newRow: MainOeuvreRow = { ...emptyRow(selectedSemaine), date: nextDate };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    const currentRows = rows.filter((r) => (r.age || "").trim() === selectedSemaine);
    if (currentRows.length <= MIN_TABLE_ROWS) return;
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

  const rowToRequest = (r: MainOeuvreRow): MainOeuvreRequest => ({
    farmId: pageFarmId ?? undefined,
    lot: lotFilter.trim() || null,
    date: r.date || today,
    age: r.age?.trim() || null,
    employerId: r.employerId ?? undefined,
    fullDay: r.fullDay,
  });

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
    const forSem = (r: MainOeuvreRow) => (r.age || "").trim() === selectedSemaine;
    const toCreate: MainOeuvreRequest[] = canSaveNew
      ? rows
          .filter((r) => forSem(r) && r.serverId == null)
          .filter((r) => r.date.trim() !== "" && r.employerId != null)
          .map((r) => rowToRequest(r))
      : [];
    const toUpdate = canSaveExisting
      ? rows.filter((r) => forSem(r) && r.serverId != null && r.date.trim() !== "" && r.employerId != null)
      : [];

    if (toCreate.length === 0 && toUpdate.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Remplissez la date et choisissez un employé pour chaque ligne nouvelle ou modifiez une ligne existante.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map((r) => api.mainOeuvre.update(r.serverId!, rowToRequest(r))));
      }
      if (toCreate.length > 0) {
        await api.mainOeuvre.createBatch(toCreate, pageFarmId ?? undefined);
      }
      const createdCount = toCreate.length;
      const updatedCount = toUpdate.length;
      const parts: string[] = [];
      if (createdCount > 0) parts.push(`${createdCount} nouvelle(s) ligne(s)`);
      if (updatedCount > 0) parts.push(`${updatedCount} ligne(s) modifiée(s)`);
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
  const weekTotalJours = currentRows.reduce((sum, r) => sum + rowJours(r.fullDay), 0);
  const cumulJours = (() => {
    const ages = new Set(rows.map((r) => (r.age || "").trim()).filter(Boolean));
    const semOrder = sortSemaines([...ages]);
    const idx = semOrder.indexOf(selectedSemaine);
    const semsUpTo = idx < 0 ? [selectedSemaine] : semOrder.slice(0, idx + 1);
    return semsUpTo.reduce(
      (sum, sem) =>
        sum + rows.filter((r) => (r.age || "").trim() === sem).reduce((s, r) => s + rowJours(r.fullDay), 0),
      0
    );
  })();

  const colCount = 5; // date, semaine (age), employé, temps, actions

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
            Choisissez une semaine pour consulter et gérer la main d&apos;œuvre.
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
                <h2 className="text-lg font-display font-bold text-foreground">Main d&apos;œuvre</h2>
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
                      <th className="min-w-[120px]">Date</th>
                      <th className="min-w-[70px]">Semaine</th>
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
                                  className="bg-transparent border-0 outline-none text-sm w-full"
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
                              Aucune entrée. {canCreate && "Ajoutez une ligne pour commencer."}
                            </td>
                          </tr>
                        )}
                        {currentRows.length > 0 && (
                          <>
                            <tr className="bg-muted/60">
                              <td colSpan={2} className="text-sm font-medium text-muted-foreground">
                                TOTAL {selectedSemaine} (jours)
                              </td>
                              <td>—</td>
                              <td className="font-semibold text-sm">{weekTotalJours}</td>
                              <td></td>
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={2} className="text-sm font-medium text-muted-foreground">
                                CUMUL (jours)
                              </td>
                              <td>—</td>
                              <td className="font-semibold text-sm">{cumulJours}</td>
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
