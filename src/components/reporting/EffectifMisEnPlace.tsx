import { useState, useEffect, useCallback } from "react";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import { api, type PlacementResponse, type PlacementRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BUILDINGS = ["Bâtiment 01", "Bâtiment 02", "Bâtiment 03", "Bâtiment 04"];
const SEXES = ["Mâle", "Femelle"];

interface PlacementRow {
  id: string;
  lot: string;
  placement_date: string;
  building: string;
  sex: string;
  initial_count: string;
}

function toRow(p: PlacementResponse): PlacementRow {
  return {
    id: String(p.id),
    lot: p.lot,
    placement_date: p.placementDate,
    building: p.building,
    sex: p.sex,
    initial_count: String(p.initialCount),
  };
}

function emptyRow(): PlacementRow {
  return {
    id: crypto.randomUUID(),
    lot: "1",
    placement_date: new Date().toISOString().split("T")[0],
    building: BUILDINGS[0],
    sex: SEXES[0],
    initial_count: "",
  };
}

/** Row id from API is numeric; new rows use UUID. */
function isSavedRow(id: string): boolean {
  return /^\d+$/.test(id);
}

interface EffectifMisEnPlaceProps {
  /** When set (Admin/RT), list and create are scoped to this farm. */
  farmId?: number | null;
}

export default function EffectifMisEnPlace({ farmId }: EffectifMisEnPlaceProps = {}) {
  const { selectedFarmName, allFarmsMode, canCreate, canUpdate, canDelete, isReadOnly } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<PlacementRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.placements.list(farmId ?? undefined);
      const mapped = list.map(toRow);
      // Backoffice (read-only): show only saved rows, no empty row to add
      setRows(isReadOnly ? mapped : (mapped.length ? [...mapped, emptyRow()] : [emptyRow()]));
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les effectifs.",
        variant: "destructive",
      });
      setRows([emptyRow()]);
    } finally {
      setLoading(false);
    }
  }, [toast, farmId, isReadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      {
        ...emptyRow(),
        id: crypto.randomUUID(),
        lot: last?.lot ?? "1",
        placement_date: last?.placement_date ?? new Date().toISOString().split("T")[0],
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof PlacementRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    if (!canCreate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas créer de données.", variant: "destructive" });
      return;
    }
    const toSend: PlacementRequest[] = rows
      .filter((r) => r.lot.trim() !== "" && r.placement_date && r.initial_count.trim() !== "")
      .map((r) => ({
        lot: r.lot.trim(),
        placementDate: r.placement_date,
        building: r.building,
        sex: r.sex,
        initialCount: parseInt(r.initial_count, 10) || 0,
      }));
    if (toSend.length === 0) {
      toast({ title: "Aucune ligne à enregistrer", description: "Renseignez au moins lot, date et effectif.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.placements.createBatch(toSend, farmId ?? undefined);
      toast({ title: "Effectifs enregistrés", description: `${toSend.length} ligne(s) enregistrée(s).` });
      await load();
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

  const totalMale = rows
    .filter((r) => r.sex === "Mâle")
    .reduce((sum, r) => sum + (parseInt(r.initial_count) || 0), 0);
  const totalFemale = rows
    .filter((r) => r.sex === "Femelle")
    .reduce((sum, r) => sum + (parseInt(r.initial_count) || 0), 0);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des effectifs…</span>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">
            Effectif Mis en Place
          </h2>
          <p className="text-xs text-muted-foreground">
            {allFarmsMode
              ? "Enregistrement initial des dindonneaux par bâtiment et sexe (toutes fermes)."
              : selectedFarmName
                ? `Ferme : ${selectedFarmName} — Enregistrement initial par bâtiment et sexe`
                : "Enregistrement initial des dindonneaux par bâtiment et sexe"}
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Ajouter
            </button>
            <button
              onClick={handleSave}
              disabled={!canCreate || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="table-farm">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Date Mise en Place</th>
              <th>Bâtiment</th>
              <th>Sexe</th>
              <th>Effectif Initial</th>
              {!isReadOnly && canDelete ? <th className="w-10"></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const saved = isSavedRow(row.id);
              const readOnly = isReadOnly || (saved && !canUpdate);
              return (
                <tr key={row.id}>
                  <td>
                    <input
                      type="number"
                      value={row.lot}
                      onChange={(e) => updateRow(row.id, "lot", e.target.value)}
                      min="1"
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.placement_date}
                      onChange={(e) => updateRow(row.id, "placement_date", e.target.value)}
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  <td>
                    <select
                      value={row.building}
                      onChange={(e) => updateRow(row.id, "building", e.target.value)}
                      className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                      disabled={readOnly}
                    >
                      {BUILDINGS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.sex}
                      onChange={(e) => updateRow(row.id, "sex", e.target.value)}
                      className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                      disabled={readOnly}
                    >
                      {SEXES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.initial_count}
                      onChange={(e) => updateRow(row.id, "initial_count", e.target.value)}
                      placeholder="0"
                      min="0"
                      readOnly={readOnly}
                      className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                    />
                  </td>
                  {!isReadOnly && canDelete ? (
                    <td>
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        disabled={rows.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60">
              <td colSpan={4} className="text-right font-semibold text-sm px-3 py-2">
                Total Mâle / Femelle :
              </td>
              <td className="px-3 py-2 font-bold text-sm">
                {totalMale} / {totalFemale}
              </td>
              {!isReadOnly && canDelete ? <td></td> : null}
            </tr>
            <tr className="bg-muted/60">
              <td colSpan={4} className="text-right font-semibold text-sm px-3 py-2">
                Total Général :
              </td>
              <td className="px-3 py-2 font-bold text-sm text-accent">
                {totalMale + totalFemale}
              </td>
              {!isReadOnly && canDelete ? <td></td> : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
