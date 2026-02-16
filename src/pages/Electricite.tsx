import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Save, Tag, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type LivraisonElectriciteResponse,
  type LivraisonElectriciteRequest,
} from "@/lib/api";

/**
 * FICHE DE SUIVI DES LIVRAISONS ÉLECTRICITÉ
 * Same permission matrix as Livraisons Aliment: canCreate for add/save, canUpdate for saved rows, canDelete for delete.
 * Columns: date, age, designation, fournisseur, qte, prix, montant, N°BR, male, femelle.
 * Grouping by week (age): rows grouped by age (S1, S2, S3, …) in numeric order; empty/"—" at end.
 * Per-week: total (qte, prix, montant, male, femelle) and cumul (running total).
 */

interface ElectriciteRow {
  id: string;
  serverId?: number;
  date: string;
  age: string;
  designation: string;
  supplier: string;
  qte: string;
  prixPerUnit: string;
  montant: string;
  numeroBR: string;
  male: string;
  femelle: string;
}

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function fromNum(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

/** Row index 1-based: lines 1–7 → S1, 8–14 → S2, etc. */
function rowIndexToAge(rowIndex1Based: number): string {
  const semNum = Math.ceil(rowIndex1Based / 7);
  return `S${semNum}`;
}

function addOneDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export default function Electricite() {
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
  const [rows, setRows] = useState<ElectriciteRow[]>([]);
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
      .then((list) => setLots(list ?? []))
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, pageFarmId, hasLotInUrl]);

  const selectFarm = useCallback(
    (id: number) => setSearchParams({ farmId: String(id) }),
    [setSearchParams]
  );
  const clearFarmSelection = useCallback(() => setSearchParams({}), [setSearchParams]);

  const emptyRow = (): ElectriciteRow => ({
    id: crypto.randomUUID(),
    date: today,
    age: "",
    designation: "",
    supplier: "",
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
      const list = await api.livraisonsElectricite.list({
        farmId: pageFarmId ?? undefined,
        lot: lotFilter.trim() || undefined,
      });
      const mapped: ElectriciteRow[] = list.map((r: LivraisonElectriciteResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        date: r.date ?? "",
        age: r.age ?? "",
        designation: r.designation ?? "",
        supplier: r.supplier ?? "",
        qte: fromNum(r.qte),
        prixPerUnit: fromNum(r.prixPerUnit),
        montant: fromNum(r.montant),
        numeroBR: r.numeroBR ?? "",
        male: fromNum(r.male),
        femelle: fromNum(r.femelle),
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
        description: e instanceof Error ? e.message : "Impossible de charger les livraisons.",
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
    const nextDate =
      lastRow?.date?.trim() !== "" ? addOneDay(lastRow.date) : today;
    const newRow = { ...emptyRow(), date: nextDate, age };
    setRows((prev) => [...prev, newRow]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.livraisonsElectricite
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

  const updateRow = (id: string, field: keyof ElectriciteRow, value: string) => {
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
    const toSend: LivraisonElectriciteRequest[] = rows
      .filter((r) => r.serverId == null)
      .filter((r) => r.date.trim() !== "")
      .map((r) => {
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
          qte: qte ?? null,
          prixPerUnit: prix > 0 ? prix : null,
          montant: montant != null && montant >= 0 ? montant : null,
          numeroBR: r.numeroBR.trim() || null,
          male: male != null && male >= 0 ? Math.round(male) : null,
          femelle: femelle != null && femelle >= 0 ? Math.round(femelle) : null,
        };
      })
      .filter((r) => r.date != null);

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
      await api.livraisonsElectricite.createBatch(toSend, pageFarmId ?? undefined);
      toast({
        title: "Livraisons enregistrées",
        description: `${toSend.length} ligne(s) enregistrée(s).`,
      });
      loadMovements();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer les livraisons.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const ageOrder = (() => {
    const ages = new Set(rows.map((r) => r.age.trim() || "—").filter((s) => s !== "—"));
    return Array.from(ages).sort((a, b) => {
      const numA = parseInt(a.replace("S", ""), 10);
      const numB = parseInt(b.replace("S", ""), 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  })();

  interface WeekBlock {
    age: string;
    rows: ElectriciteRow[];
    total: { qte: number; prix: number; montant: number; male: number; femelle: number };
    cumul: { qte: number; prix: number; montant: number; male: number; femelle: number };
  }

  const blocksWithTotals: WeekBlock[] = [];
  let runningCumul = { qte: 0, prix: 0, montant: 0, male: 0, femelle: 0 };

  for (const age of ageOrder) {
    const weekRows = rows.filter((r) => (r.age.trim() || "—") === age);
    const total = { qte: 0, prix: 0, montant: 0, male: 0, femelle: 0 };
    for (const r of weekRows) {
      total.qte += toNum(r.qte);
      total.prix += toNum(r.prixPerUnit);
      total.montant += toNum(r.montant);
      total.male += toNum(r.male);
      total.femelle += toNum(r.femelle);
    }
    runningCumul = {
      qte: runningCumul.qte + total.qte,
      prix: runningCumul.prix + total.prix,
      montant: runningCumul.montant + total.montant,
      male: runningCumul.male + total.male,
      femelle: runningCumul.femelle + total.femelle,
    };
    blocksWithTotals.push({ age, rows: weekRows, total, cumul: { ...runningCumul } });
  }

  const rowsWithoutAge = rows.filter((r) => {
    const s = r.age.trim() || "—";
    return s === "—" || !ageOrder.includes(s);
  });
  if (rowsWithoutAge.length > 0) {
    const total = { qte: 0, prix: 0, montant: 0, male: 0, femelle: 0 };
    for (const r of rowsWithoutAge) {
      total.qte += toNum(r.qte);
      total.prix += toNum(r.prixPerUnit);
      total.montant += toNum(r.montant);
      total.male += toNum(r.male);
      total.femelle += toNum(r.femelle);
    }
    runningCumul = {
      qte: runningCumul.qte + total.qte,
      prix: runningCumul.prix + total.prix,
      montant: runningCumul.montant + total.montant,
      male: runningCumul.male + total.male,
      femelle: runningCumul.femelle + total.femelle,
    };
    blocksWithTotals.push({
      age: "—",
      rows: rowsWithoutAge,
      total,
      cumul: { ...runningCumul },
    });
  }

  const colCount = 11; // date, age, designation, fournisseur, qte, prix, montant, N°BR, male, femelle, actions

  return (
    <AppLayout>
      <div className="page-header">
        <h1>FICHE DE SUIVI DES LIVRAISONS ÉLECTRICITÉ</h1>
        <p>
          Suivi des livraisons électricité par lot et semaine
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
              ? "Choisissez une ferme pour consulter les livraisons électricité."
              : "Choisissez une ferme pour consulter et gérer les livraisons électricité."}
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
            title="Choisir un lot — Livraisons Électricité"
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
                <h2 className="text-lg font-display font-bold text-foreground">
                  Livraisons électricité
                </h2>
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
                      <th className="min-w-[100px]">date</th>
                      <th className="min-w-[70px]">age</th>
                      <th className="min-w-[180px]">designation</th>
                      <th className="min-w-[120px]">fournisseur</th>
                      <th className="min-w-[70px]">qte</th>
                      <th className="min-w-[80px]">prix</th>
                      <th className="min-w-[90px]">montant</th>
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
                        {blocksWithTotals.map((block) => (
                          <React.Fragment key={block.age}>
                            {block.rows.map((row) => {
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
                            <tr className="bg-muted/60">
                              <td colSpan={4} className="text-sm font-medium text-muted-foreground">
                                {block.age === "—" ? "TOTAL" : `TOTAL ${block.age}`}
                              </td>
                              <td>{block.total.qte}</td>
                              <td>{block.total.prix.toFixed(2)}</td>
                              <td>{block.total.montant.toFixed(2)}</td>
                              <td>—</td>
                              <td>{block.total.male}</td>
                              <td>{block.total.femelle}</td>
                              <td></td>
                            </tr>
                            <tr className="bg-muted/50">
                              <td colSpan={4} className="text-sm font-medium text-muted-foreground">
                                CUMUL
                              </td>
                              <td>{block.cumul.qte}</td>
                              <td>{block.cumul.prix.toFixed(2)}</td>
                              <td>{block.cumul.montant.toFixed(2)}</td>
                              <td>—</td>
                              <td>{block.cumul.male}</td>
                              <td>{block.cumul.femelle}</td>
                              <td></td>
                            </tr>
                          </React.Fragment>
                        ))}
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
