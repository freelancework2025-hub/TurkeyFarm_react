import React, { useState } from "react";
import { Loader2, Plus, Tag } from "lucide-react";

/**
 * Shown when no lot is selected. Displays existing lots as clickable boxes
 * (like the farm selector for responsable technique) and an optional "Nouveau lot" input.
 * User chooses a lot to enter that lot's data.
 */
interface LotSelectorViewProps {
  existingLots: string[];
  loading?: boolean;
  onSelectLot: (lot: string) => void;
  onNewLot?: (lot: string) => void;
  canCreate?: boolean;
  title?: string;
  /** Short line under the title, e.g. "Choisissez un lot pour consulter et gérer les données." */
  description?: string;
  emptyMessage?: string;
}

export default function LotSelectorView({
  existingLots,
  loading = false,
  onSelectLot,
  onNewLot,
  canCreate = true,
  title = "Choisir un lot",
  description = "Choisissez un lot pour afficher ou modifier les données, ou créez un nouveau lot.",
  emptyMessage = "Aucun lot existant. Créez un nouveau lot pour commencer.",
}: LotSelectorViewProps) {
  const [newLotValue, setNewLotValue] = useState("");
  const [submittingNew, setSubmittingNew] = useState(false);

  const handleNewLotSubmit = () => {
    const trimmed = newLotValue.trim();
    if (!trimmed || !onNewLot) return;
    setSubmittingNew(true);
    onNewLot(trimmed);
    setSubmittingNew(false);
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Chargement des lots…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        {title && (
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2 mb-1">
            <Tag className="w-5 h-5" />
            {title}
          </h2>
        )}
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {existingLots.map((lot) => (
          <button
            key={lot}
            type="button"
            onClick={() => onSelectLot(lot)}
            className="flex items-center gap-3 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
              <Tag className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground truncate">Lot {lot}</div>
              <div className="text-xs text-muted-foreground">Cliquer pour entrer</div>
            </div>
          </button>
        ))}

        {canCreate && onNewLot && (
          <div className="flex flex-col gap-2 p-5 rounded-xl border-2 border-dashed border-border bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Plus className="w-4 h-4" />
              Nouveau lot
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLotValue}
                onChange={(e) => setNewLotValue(e.target.value)}
                placeholder="N° lot"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => e.key === "Enter" && handleNewLotSubmit()}
              />
              <button
                type="button"
                onClick={handleNewLotSubmit}
                disabled={!newLotValue.trim() || submittingNew}
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      {existingLots.length === 0 && (!canCreate || !onNewLot) && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}
