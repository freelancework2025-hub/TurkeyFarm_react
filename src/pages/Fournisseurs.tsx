import AppLayout from "@/components/layout/AppLayout";
import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

const DESIGNATIONS = [
  "DC.DEM.0-21.MI EN SAC",
  "DC.DEM.0-21.MI EN VRAC",
  "DC.CRS.22-35.GM EN VRAC",
  "DC.CRS.36-56.GR EN VRAC",
  "DC.FIN.57-70.GR EN VRAC",
  "DC.FIN.71-91.GR EN VRAC",
  "DC.FIN.92-105.GR EN VRAC",
  "DC.FIN.106-140.GR EN VRAC",
];

interface FournisseurCol {
  id: string;
  name: string;
}

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState<FournisseurCol[]>([
    { id: "1", name: "Fournisseur A" },
    { id: "2", name: "Fournisseur B" },
  ]);

  const [designations, setDesignations] = useState(DESIGNATIONS);
  const [newDesignation, setNewDesignation] = useState("");

  // prices[designationIndex][fournisseurId] = price string
  const [prices, setPrices] = useState<Record<string, Record<string, string>>>({});

  const updatePrice = (desIdx: number, fId: string, val: string) => {
    setPrices((prev) => ({
      ...prev,
      [desIdx]: { ...(prev[desIdx] || {}), [fId]: val },
    }));
  };

  const addFournisseur = () => {
    setFournisseurs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: `Fournisseur ${String.fromCharCode(65 + prev.length)}` },
    ]);
  };

  const removeFournisseur = (id: string) => {
    if (fournisseurs.length > 1) setFournisseurs((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFournisseurName = (id: string, name: string) => {
    setFournisseurs((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const addDesignation = () => {
    if (newDesignation.trim()) {
      setDesignations((prev) => [...prev, newDesignation.trim()]);
      setNewDesignation("");
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Fournisseurs — Prix d'Aliment</h1>
        <p>Grille comparative des prix d'aliment par fournisseur et désignation</p>
      </div>

      <div className="space-y-6 w-full min-w-0">
      <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in w-full min-w-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
          <h2 className="text-lg font-display font-bold text-foreground">
            Prix d'Aliment
          </h2>
          <div className="flex gap-2">
            <button onClick={addFournisseur} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> Fournisseur
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
                <th className="min-w-[250px]">Désignation</th>
                {fournisseurs.map((f) => (
                  <th key={f.id} className="min-w-[150px]">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) => updateFournisseurName(f.id, e.target.value)}
                        className="bg-transparent border-0 outline-none text-primary-foreground font-semibold text-xs w-full"
                      />
                      <button onClick={() => removeFournisseur(f.id)} className="text-primary-foreground/60 hover:text-primary-foreground">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {designations.map((des, idx) => (
                <tr key={idx}>
                  <td className="font-medium text-sm">{des}</td>
                  {fournisseurs.map((f) => (
                    <td key={f.id}>
                      <input
                        type="number"
                        value={prices[idx]?.[f.id] || ""}
                        onChange={(e) => updatePrice(idx, f.id, e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add new designation */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          <input
            type="text"
            value={newDesignation}
            onChange={(e) => setNewDesignation(e.target.value)}
            placeholder="Nouvelle désignation..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => e.key === "Enter" && addDesignation()}
          />
          <button onClick={addDesignation} className="flex items-center gap-1.5 px-3 py-2 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Ajouter Ligne
          </button>
        </div>
      </div>
      </div>
    </AppLayout>
  );
}
