import { useState } from "react";
import { Plus, Save, CheckCircle, Trash2 } from "lucide-react";

const BUILDINGS = ["Bâtiment 01", "Bâtiment 02", "Bâtiment 03", "Bâtiment 04"];
const DESIGNATIONS = ["Mâle", "Femelle"];

interface DailyRow {
  id: string;
  report_date: string;
  age_jour: string;
  semaine: string;
  building: string;
  designation: string;
  nbr: string;
  water_l: string;
  temp_min: string;
  temp_max: string;
  traitement: string;
  verified: boolean;
}

export default function DailyReportTable() {
  const today = new Date().toISOString().split("T")[0];

  const [rows, setRows] = useState<DailyRow[]>([
    {
      id: "1",
      report_date: today,
      age_jour: "",
      semaine: "",
      building: BUILDINGS[0],
      designation: DESIGNATIONS[0],
      nbr: "",
      water_l: "",
      temp_min: "",
      temp_max: "",
      traitement: "",
      verified: false,
    },
  ]);

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        report_date: last?.report_date || today,
        age_jour: last?.age_jour || "",
        semaine: last?.semaine || "",
        building: BUILDINGS[0],
        designation: DESIGNATIONS[0],
        nbr: "",
        water_l: "",
        temp_min: "",
        temp_max: "",
        traitement: "",
        verified: false,
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof DailyRow, value: string | boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const totalMortality = rows.reduce((s, r) => s + (parseInt(r.nbr) || 0), 0);

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">
            Reporting Journalier
          </h2>
          <p className="text-xs text-muted-foreground">
            Suivi quotidien : mortalité, consommation d'eau, température, traitements
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Ligne
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
              <th>Date</th>
              <th>Âge (J)</th>
              <th>Semaine</th>
              <th>Bâtiment</th>
              <th>Désignation</th>
              <th>NBR (Mortalité)</th>
              <th>Conso. Eau (L)</th>
              <th>Temp. Min</th>
              <th>Temp. Max</th>
              <th>Traitement</th>
              <th>Vérifié</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="date"
                    value={row.report_date}
                    onChange={(e) => updateRow(row.id, "report_date", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.age_jour}
                    onChange={(e) => updateRow(row.id, "age_jour", e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.semaine}
                    onChange={(e) => updateRow(row.id, "semaine", e.target.value)}
                    placeholder="0"
                    min="0"
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
                    value={row.designation}
                    onChange={(e) => updateRow(row.id, "designation", e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-sm py-0.5"
                  >
                    {DESIGNATIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={row.nbr}
                    onChange={(e) => updateRow(row.id, "nbr", e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.water_l}
                    onChange={(e) => updateRow(row.id, "water_l", e.target.value)}
                    placeholder="0.0"
                    step="0.1"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.temp_min}
                    onChange={(e) => updateRow(row.id, "temp_min", e.target.value)}
                    placeholder="°C"
                    step="0.1"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.temp_max}
                    onChange={(e) => updateRow(row.id, "temp_max", e.target.value)}
                    placeholder="°C"
                    step="0.1"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.traitement}
                    onChange={(e) => updateRow(row.id, "traitement", e.target.value)}
                    placeholder="—"
                    className="min-w-[120px]"
                  />
                </td>
                <td className="text-center">
                  <button
                    onClick={() => updateRow(row.id, "verified", !row.verified)}
                    className={`p-1 rounded transition-colors ${
                      row.verified
                        ? "text-farm-green"
                        : "text-muted-foreground hover:text-accent"
                    }`}
                    title={row.verified ? "Vérifié" : "Marquer comme vérifié"}
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
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
                Total Mortalité du jour :
              </td>
              <td className="px-3 py-2 font-bold text-sm text-destructive">
                {totalMortality}
              </td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
