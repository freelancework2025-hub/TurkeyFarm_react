import React, { useState } from "react";
import { Loader2, Plus, Tag, Lock, LockOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type LotWithStatus = { lot: string; closed: boolean };

/**
 * Shown when no lot is selected. Displays existing lots as clickable boxes
 * (like the farm selector for responsable technique) and an optional "Nouveau lot" input.
 * User chooses a lot to enter that lot's data.
 * When lotsWithStatus is provided, closed lots appear grey; RT/Admin can close/open via hover buttons.
 */
interface LotSelectorViewProps {
  /** Plain list of lot names (used when lotsWithStatus not provided) */
  existingLots: string[];
  /** When provided, lots are shown with closed state (grey). Enables close/open for canCloseOpen. */
  lotsWithStatus?: LotWithStatus[];
  loading?: boolean;
  onSelectLot: (lot: string) => void;
  onNewLot?: (lot: string) => void;
  /** When true, show "Nouveau lot". Only InfosSetup passes true (RT/Admin); other pages use false. */
  canCreate?: boolean;
  /** Only RESPONSABLE_TECHNIQUE and ADMINISTRATEUR: show "Fermer le lot" / "Ouvrir le lot" on hover and allow close/open after confirmation */
  canCloseOpen?: boolean;
  onCloseLot?: (lot: string) => void | Promise<void>;
  onOpenLot?: (lot: string) => void | Promise<void>;
  title?: string;
  description?: string;
  emptyMessage?: string;
}

export default function LotSelectorView({
  existingLots,
  lotsWithStatus,
  loading = false,
  onSelectLot,
  onNewLot,
  canCreate = true,
  canCloseOpen = false,
  onCloseLot,
  onOpenLot,
  title = "Choisir un lot",
  description = "Choisissez un lot pour afficher ou modifier les données, ou créez un nouveau lot.",
  emptyMessage = "Aucun lot existant. Créez un nouveau lot pour commencer.",
}: LotSelectorViewProps) {
  const [newLotValue, setNewLotValue] = useState("");
  const [submittingNew, setSubmittingNew] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingLot, setPendingLot] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const items: LotWithStatus[] = lotsWithStatus?.length
    ? lotsWithStatus
    : existingLots.map((lot) => ({ lot, closed: false }));

  const handleNewLotSubmit = () => {
    const trimmed = newLotValue.trim();
    if (!trimmed || !onNewLot) return;
    setSubmittingNew(true);
    onNewLot(trimmed);
    setSubmittingNew(false);
  };

  const handleRequestClose = (e: React.MouseEvent, lot: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingLot(lot);
    setConfirmClose(true);
  };

  const handleRequestOpen = (e: React.MouseEvent, lot: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingLot(lot);
    setConfirmOpen(true);
  };

  const handleConfirmClose = async () => {
    if (!pendingLot || !onCloseLot) return;
    setActionLoading(true);
    try {
      await onCloseLot(pendingLot);
      setConfirmClose(false);
      setPendingLot(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmOpen = async () => {
    if (!pendingLot || !onOpenLot) return;
    setActionLoading(true);
    try {
      await onOpenLot(pendingLot);
      setConfirmOpen(false);
      setPendingLot(null);
    } finally {
      setActionLoading(false);
    }
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
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(({ lot, closed }) => (
          <div
            key={lot}
            className="relative group/card"
          >
            {canCloseOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-3 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none group-hover/card:pointer-events-auto"
                aria-hidden
              >
                <Button
                  type="button"
                  size="sm"
                  variant={closed ? "default" : "secondary"}
                  className="shadow-md gap-1.5"
                  onClick={(e) => (closed ? handleRequestOpen(e, lot) : handleRequestClose(e, lot))}
                >
                  {closed ? (
                    <>
                      <LockOpen className="w-3.5 h-3.5" />
                      Ouvrir le lot
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      Fermer le lot
                    </>
                  )}
                </Button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelectLot(lot)}
              className={`w-full flex items-center gap-3 p-5 rounded-xl border-2 text-left transition-colors ${
                closed
                  ? "border-muted-foreground/30 bg-muted/60 text-muted-foreground hover:bg-muted/80"
                  : "border-border bg-card hover:border-primary hover:bg-muted/50"
              }`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                  closed ? "bg-muted-foreground/20" : "bg-primary/10 text-primary group-hover/card:bg-primary/20"
                }`}
              >
                <Tag className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">Lot {lot}</div>
                <div className="text-xs text-muted-foreground">
                  {closed ? "Lot fermé" : "Cliquer pour entrer"}
                </div>
              </div>
            </button>
          </div>
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

      {items.length === 0 && (!canCreate || !onNewLot) && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      <AlertDialog open={confirmClose} onOpenChange={(open) => !actionLoading && setConfirmClose(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fermer le lot</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous fermer le lot <strong>{pendingLot}</strong> ? Les autres utilisateurs (autres responsables techniques, responsable de ferme, back-office) ne pourront plus y accéder. En tant que responsable technique, vous pourrez encore consulter les données de ce lot ; vous pourrez aussi le rouvrir à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmClose();
              }}
              disabled={actionLoading}
            >
              {actionLoading ? "En cours…" : "Fermer le lot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !actionLoading && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ouvrir le lot</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous rouvrir le lot <strong>{pendingLot}</strong> ? Tous les utilisateurs pourront à nouveau y accéder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmOpen();
              }}
              disabled={actionLoading}
            >
              {actionLoading ? "En cours…" : "Ouvrir le lot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
