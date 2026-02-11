import AppLayout from "@/components/layout/AppLayout";
import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

const TYPES = [
  "Divers", "Consommation Employés (kg)", "Gratuite (kg)",
  "Vente Dinde Vive", "Vente Aliment", "Fumier",
];
const SEXES = ["Mâle", "Femelle"];

interface SortieRow {
  id: string;
  sexe: string;
  semaine: string;
  date: string;
  lot: string;
  client: string;
  type: string;
  designation: string;
  num_bl: string;
  nbre_dinde: string;
  qte_brute_kg: string;
  prix_kg: string;
  montant_ttc: string;
}

export default function SortiesFerme() {
  const today = new Date().toISOString().split("T")[0];
  const [rows, setRows] = useState<SortieRow[]>([
    {
      id: "1", sexe: SEXES[0], semaine: "", date: today, lot: "",
      client: "", type: TYPES[0], designation: "", num_bl: "",
      nbre_dinde: "", qte_brute_kg: "", prix_kg: "", montant_ttc: "",
    },
  ]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(), sexe: SEXES[0], semaine: "", date: today, lot: "",
        client: "", type: TYPES[0], designation: "", num_bl: "",
        nbre_dinde: "", qte_brute_kg: "", prix_kg: "", montant_ttc: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof SortieRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // Auto-calc montant
        const qty = parseFloat(updated.qte_brute_kg) || 0;
        const price = parseFloat(updated.prix_kg) || 0;
        updated.montant_ttc = (qty * price).toFixed(2);
        return updated;
      })
    );
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Sorties Ferme</h1>
        <p>Enregistrement des ventes et sorties de dindes</p>
      </div>

      <div className="space-y-6 w-full min-w-0">
      <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-display font-bold text-foreground">
            Tableau des Sorties
          </h2>
          <div className="flex gap-2">
            <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
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
                <th className="min-w-[100px]">Sexe</th>
                <th>Semaine</th>
                <th>Date</th>
                <th>Lot</th>
                <th>Client</th>
                <th>Type</th>
                <th>Désignation</th>
                <th>N° BL</th>
                <th>Nbre Dinde</th>
                <th>Qté Brute (kg)</th>
                <th>Prix/kg</th>
                <th>Montant TTC</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="min-w-[100px]">
                    <select value={row.sexe} onChange={(e) => updateRow(row.id, "sexe", e.target.value)} className="w-full min-w-[90px] bg-transparent border-0 outline-none text-sm">
                      {SEXES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={row.semaine} onChange={(e) => updateRow(row.id, "semaine", e.target.value)} placeholder="0" /></td>
                  <td><input type="date" value={row.date} onChange={(e) => updateRow(row.id, "date", e.target.value)} /></td>
                  <td><input type="text" value={row.lot} onChange={(e) => updateRow(row.id, "lot", e.target.value)} placeholder="—" /></td>
                  <td><input type="text" value={row.client} onChange={(e) => updateRow(row.id, "client", e.target.value)} placeholder="—" className="min-w-[100px]" /></td>
                  <td>
                    <select value={row.type} onChange={(e) => updateRow(row.id, "type", e.target.value)} className="w-full bg-transparent border-0 outline-none text-sm">
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td><input type="text" value={row.designation} onChange={(e) => updateRow(row.id, "designation", e.target.value)} placeholder="—" /></td>
                  <td><input type="text" value={row.num_bl} onChange={(e) => updateRow(row.id, "num_bl", e.target.value)} placeholder="—" /></td>
                  <td><input type="number" value={row.nbre_dinde} onChange={(e) => updateRow(row.id, "nbre_dinde", e.target.value)} placeholder="0" /></td>
                  <td><input type="number" value={row.qte_brute_kg} onChange={(e) => updateRow(row.id, "qte_brute_kg", e.target.value)} placeholder="0.0" step="0.1" /></td>
                  <td><input type="number" value={row.prix_kg} onChange={(e) => updateRow(row.id, "prix_kg", e.target.value)} placeholder="0.00" step="0.01" /></td>
                  <td className="font-semibold text-sm">{row.montant_ttc || "0.00"}</td>
                  <td>
                    <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" disabled={rows.length <= 1}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </AppLayout>
  );
}
