import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Plus, Save, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FarmResponse, type SortieResponse } from "@/lib/api";

/**
 * Permission matrix (same as Reporting Journalier):
 * - ADMINISTRATEUR / RESPONSABLE_TECHNIQUE: Ligne + Enregistrer visible; can edit/delete any row.
 * - BACKOFFICE_EMPLOYER: No Ligne, no Enregistrer; all rows read-only; no delete (isReadOnly, !canCreate, !canUpdate, !canDelete).
 * - RESPONSABLE_FERME: Ligne + Enregistrer visible; saved rows read-only; no delete on saved rows (canCreate, !canUpdate, !canDelete).
 * Buttons: Ligne & Enregistrer only when canCreate. Delete on row: when saved → canDelete; when new → canCreate.
 */

const TYPES = [
  "Divers",
  "Consommation Employés (kg)",
  "Gratuite (kg)",
  "Vente Dinde Vive",
  "Vente Aliment",
  "Fumier",
];

/** Désignation options when type is Consommation Employés, Gratuite, or Vente Dinde Vive */
const DESIGNATION_OPTIONS = ["Male", "Femelle", "Déclassée"];

const TYPES_WITH_DESIGNATION_DROPDOWN = [
  "Consommation Employés (kg)",
  "Gratuite (kg)",
  "Vente Dinde Vive",
];

function typeUsesDesignationDropdown(type: string): boolean {
  return TYPES_WITH_DESIGNATION_DROPDOWN.includes(type);
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
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);

  const {
    isAdministrateur,
    isResponsableTechnique,
    isBackofficeEmployer,
    canAccessAllFarms,
    isReadOnly,
    canCreate,
    canUpdate,
    canDelete,
  } = useAuth();
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  const pageFarmId = isValidFarmId ? selectedFarmId : undefined;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [rows, setRows] = useState<SortieRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const selectFarm = useCallback(
    (id: number) => setSearchParams({ farmId: String(id) }),
    [setSearchParams]
  );
  const clearFarmSelection = useCallback(() => setSearchParams({}), [setSearchParams]);

  const emptyRow = (): SortieRow => ({
    id: crypto.randomUUID(),
    semaine: "",
    date: today,
    lot: "",
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
    if (showFarmSelector) return;
    setLoading(true);
    try {
      const list = await api.sorties.list(pageFarmId ?? undefined);
      const mapped: SortieRow[] = list.map((r: SortieResponse) => ({
        id: crypto.randomUUID(),
        serverId: r.id,
        semaine: r.semaine != null ? String(r.semaine) : "",
        date: r.date ?? "",
        lot: r.lot ?? "",
        client: r.client ?? "",
        num_bl: r.num_bl ?? "",
        type: r.type ?? TYPES[0],
        designation: r.designation ?? "",
        nbre_dinde: r.nbre_dinde != null ? String(r.nbre_dinde) : "",
        qte_brute_kg: r.qte_brute_kg != null ? String(r.qte_brute_kg) : "",
        prix_kg: r.prix_kg != null ? String(r.prix_kg) : "",
        montant_ttc: r.montant_ttc != null ? String(r.montant_ttc) : "",
      }));
      setRows(isReadOnly ? mapped : (mapped.length ? [...mapped, emptyRow()] : [emptyRow()]));
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les sorties.",
        variant: "destructive",
      });
      setRows(canCreate ? [emptyRow()] : []);
    } finally {
      setLoading(false);
    }
  }, [showFarmSelector, pageFarmId, isReadOnly, canCreate, toast]);

  useEffect(() => {
    loadSorties();
  }, [loadSorties]);

  const addRow = () => {
    if (!canCreate) return;
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    const row = rows.find((r) => r.id === id);
    if (row?.serverId != null && !canDelete) return;
    if (row?.serverId != null) {
      api.sorties
        .delete(row.serverId)
        .then(() => loadSorties())
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

  const updateRow = (id: string, field: keyof SortieRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        const qty = parseFloat(updated.qte_brute_kg) || 0;
        const price = parseFloat(updated.prix_kg) || 0;
        updated.montant_ttc = (qty * price).toFixed(2);
        return updated;
      })
    );
  };

  const handleSave = async () => {
    if (!canCreate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas créer de données.", variant: "destructive" });
      return;
    }
    const toSend = rows
      .filter((r) => r.serverId == null)
      .map((r) => ({
        date: r.date || null,
        semaine: r.semaine.trim() !== "" ? parseInt(r.semaine, 10) : null,
        lot: r.lot || null,
        client: r.client || null,
        num_bl: r.num_bl || null,
        type: r.type || null,
        designation: r.designation || null,
        nbre_dinde: r.nbre_dinde.trim() !== "" ? parseInt(r.nbre_dinde, 10) : null,
        qte_brute_kg: r.qte_brute_kg.trim() !== "" ? parseFloat(r.qte_brute_kg) : null,
        prix_kg: r.prix_kg.trim() !== "" ? parseFloat(r.prix_kg) : null,
        montant_ttc: r.montant_ttc.trim() !== "" ? parseFloat(r.montant_ttc) : null,
      }));
    if (toSend.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Ajoutez au moins une ligne nouvelle (non encore enregistrée).",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await api.sorties.createBatch(toSend, pageFarmId ?? undefined);
      toast({ title: "Sorties enregistrées", description: `${toSend.length} ligne(s) enregistrée(s).` });
      loadSorties();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer les sorties.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Sorties Ferme</h1>
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

          <div className="space-y-6 w-full min-w-0">
            <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-lg font-display font-bold text-foreground">
                  Tableau des Sorties
                </h2>
                {canCreate && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addRow}
                      disabled={!canCreate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" /> Ligne
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canCreate || saving || loading}
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
                      <th>Semaine</th>
                      <th>Date</th>
                      <th>Lot</th>
                      <th>Client</th>
                      <th>N° BL</th>
                      <th>Type</th>
                      <th>Désignation</th>
                      <th>Nbre Dinde</th>
                      <th>Qté Brute (kg)</th>
                      <th>Prix/kg</th>
                      <th>Montant TTC</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-muted-foreground">
                          Chargement…
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => {
                        const rowReadOnly = isReadOnly || (row.serverId != null && !canUpdate);
                        const showDelete = row.serverId != null ? canDelete : canCreate;
                        return (
                          <tr key={row.id}>
                            <td>
                              <input type="number" value={row.semaine} onChange={(e) => updateRow(row.id, "semaine", e.target.value)} placeholder="—" disabled={rowReadOnly} />
                            </td>
                            <td>
                              <input type="date" value={row.date} onChange={(e) => updateRow(row.id, "date", e.target.value)} disabled={rowReadOnly} />
                            </td>
                            <td>
                              <input type="text" value={row.lot} onChange={(e) => updateRow(row.id, "lot", e.target.value)} placeholder="—" disabled={rowReadOnly} />
                            </td>
                            <td>
                              <input type="text" value={row.client} onChange={(e) => updateRow(row.id, "client", e.target.value)} placeholder="—" className="min-w-[100px]" disabled={rowReadOnly} />
                            </td>
                            <td>
                              <input type="text" value={row.num_bl} onChange={(e) => updateRow(row.id, "num_bl", e.target.value)} placeholder="—" disabled={rowReadOnly} />
                            </td>
                            <td>
                              <select value={row.type} onChange={(e) => updateRow(row.id, "type", e.target.value)} className="w-full min-w-[140px] bg-transparent border-0 outline-none text-sm" disabled={rowReadOnly}>
                                {TYPES.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td className="min-w-[120px]">
                              {typeUsesDesignationDropdown(row.type) ? (
                                <select
                                  value={row.designation}
                                  onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                                  className="w-full bg-transparent border-0 outline-none text-sm"
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
                                />
                              )}
                            </td>
                            <td>
                              <input type="number" value={row.nbre_dinde} onChange={(e) => updateRow(row.id, "nbre_dinde", e.target.value)} placeholder="—" disabled={rowReadOnly} />
                            </td>
                            <td>
                              <input type="number" value={row.qte_brute_kg} onChange={(e) => updateRow(row.id, "qte_brute_kg", e.target.value)} placeholder="—" step="0.1" disabled={rowReadOnly} />
                            </td>
                            <td>
                              <input type="number" value={row.prix_kg} onChange={(e) => updateRow(row.id, "prix_kg", e.target.value)} placeholder="—" step="0.01" disabled={rowReadOnly} />
                            </td>
                            <td className="font-semibold text-sm">{row.montant_ttc || "0.00"}</td>
                            <td>
                              {showDelete && (
                                <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" disabled={rows.length <= 1}>
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
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
