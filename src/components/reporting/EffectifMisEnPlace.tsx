import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

const FARMS = [
  "Marjana elevage",
  "sidi kaceme 1",
  "sidi kaceme 2",
  "had frid",
  "daidia",
  "maidnate",
];
const BUILDINGS = ["Bâtiment 01", "Bâtiment 02", "Bâtiment 03", "Bâtiment 04"];
const SEXES = ["Mâle", "Femelle"];

interface PlacementRow {
  id: string;
  farm_name: string;
  lot: string;
  placement_date: string;
  building: string;
  sex: string;
  initial_count: string;
}

export default function EffectifMisEnPlace() {
  const [rows, setRows] = useState<PlacementRow[]>([
    {
      id: "1",
      farm_name: FARMS[0],
      lot: "1",
      placement_date: new Date().toISOString().split("T")[0],
      building: BUILDINGS[0],
      sex: SEXES[0],
      initial_count: "",
    },
  ]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        farm_name: prev[prev.length - 1]?.farm_name || FARMS[0],
        lot: prev[prev.length - 1]?.lot || "1",
        placement_date: prev[prev.length - 1]?.placement_date || new Date().toISOString().split("T")[0],
        building: BUILDINGS[0],
        sex: SEXES[0],
        initial_count: "",
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

  // Compute totals per sex
  const totalMale = rows
    .filter((r) => r.sex === "Mâle")
    .reduce((sum, r) => sum + (parseInt(r.initial_count) || 0), 0);
  const totalFemale = rows
    .filter((r) => r.sex === "Femelle")
    .reduce((sum, r) => sum + (parseInt(r.initial_count) || 0), 0);

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">
            Effectif Mis en Place
          </h2>
          <p className="text-xs text-muted-foreground">
            Enregistrement initial des dindonneaux par bâtiment et sexe
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Ajouter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-farm">
          <thead>
            <tr>
              <th>Ferme</th>
              <th>Lot</th>
              <th>Date Mise en Place</th>
              <th>Bâtiment</th>
              <th>Sexe</th>
              <th>Effectif Initial</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <select
                    value={row.farm_name}
                    onChange={(e) => updateRow(row.id, "farm_name", e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-sm py-0.5"
                  >
                    {FARMS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={row.lot}
                    onChange={(e) => updateRow(row.id, "lot", e.target.value)}
                    min="1"
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={row.placement_date}
                    onChange={(e) => updateRow(row.id, "placement_date", e.target.value)}
                  />
                </td>
                <td>
                  <select
                    value={row.building}
                    onChange={(e) => updateRow(row.id, "building", e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-sm py-0.5"
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
                    className="w-full bg-transparent border-0 outline-none text-sm py-0.5"
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
                  />
                </td>
                <td>
                  <button
                    onClick={() => removeRow(row.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    disabled={rows.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60">
              <td colSpan={5} className="text-right font-semibold text-sm px-3 py-2">
                Total Mâle / Femelle :
              </td>
              <td className="px-3 py-2 font-bold text-sm">
                {totalMale} / {totalFemale}
              </td>
              <td></td>
            </tr>
            <tr className="bg-muted/60">
              <td colSpan={5} className="text-right font-semibold text-sm px-3 py-2">
                Total Général :
              </td>
              <td className="px-3 py-2 font-bold text-sm text-accent">
                {totalMale + totalFemale}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
