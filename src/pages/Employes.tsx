import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type EmployerResponse,
  type EmployerRequest,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Liste des employés — Nom, Prénom, Salaire. Global list, not tied to any farm.
 * ADMINISTRATEUR / RESPONSABLE_TECHNIQUE: full CRUD.
 * BACKOFFICE_EMPLOYER: read-only (link visible, page view only).
 */

export default function Employes() {
  const { isReadOnly, canCreate, canUpdate, canDelete, hasFullAccess } = useAuth();
  /** Only responsable technique and administrateur can manage (create/update/delete) employés. */
  const canManageEmployes = hasFullAccess;
  const [employers, setEmployers] = useState<EmployerResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formNom, setFormNom] = useState("");
  const [formPrenom, setFormPrenom] = useState("");
  const [formNumeroEmploye, setFormNumeroEmploye] = useState("");
  const [formSalaire, setFormSalaire] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employerToDelete, setEmployerToDelete] = useState<{
    id: number;
    nom: string;
    prenom: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.employers.list();
      setEmployers(list);
    } catch {
      /* API error — logged in backend only */
      setEmployers([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadEmployers();
  }, [loadEmployers]);

  const openCreate = () => {
    setEditingId(null);
    setFormNom("");
    setFormPrenom("");
    setFormNumeroEmploye("");
    setFormSalaire("");
    setDialogOpen(true);
  };

  const openEdit = (e: EmployerResponse) => {
    setEditingId(e.id);
    setFormNom(e.nom ?? "");
    setFormPrenom(e.prenom ?? "");
    setFormNumeroEmploye(e.numeroEmploye ?? "");
    setFormSalaire(e.salaire != null ? String(e.salaire) : "");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    const nom = formNom.trim();
    const prenom = formPrenom.trim();
    if (!nom || !prenom) {
      toast({
        title: "Champs requis",
        description: "Nom et prénom sont obligatoires.",
        variant: "destructive",
      });
      return;
    }
    const salaire =
      formSalaire.trim() !== ""
        ? parseFloat(formSalaire.replace(",", "."))
        : null;
    if (formSalaire.trim() !== "" && (Number.isNaN(salaire) || salaire < 0)) {
      toast({
        title: "Salaire invalide",
        description: "Le salaire doit être un nombre ≥ 0.",
        variant: "destructive",
      });
      return;
    }

    const body: EmployerRequest = {
      nom,
      prenom,
      numeroEmploye: formNumeroEmploye.trim() || undefined,
      salaire: salaire ?? undefined,
    };

    try {
      if (editingId != null) {
        if (!canManageEmployes) {
          toast({
            title: "Non autorisé",
            description: "Vous ne pouvez pas modifier les employés.",
            variant: "destructive",
          });
          return;
        }
        await api.employers.update(editingId, body);
        toast({
          title: "Employé mis à jour",
          description: `${nom} ${prenom} a été mis à jour.`,
        });
      } else {
        if (!canManageEmployes) {
          toast({
            title: "Non autorisé",
            description: "Vous ne pouvez pas ajouter d'employé.",
            variant: "destructive",
          });
          return;
        }
        await api.employers.create(body);
        toast({
          title: "Employé ajouté",
          description: `${nom} ${prenom} a été ajouté.`,
        });
      }
      closeDialog();
      loadEmployers();
    } catch {
      /* API error — logged in backend only */
    }
  };

  const openDeleteDialog = (e: EmployerResponse) => {
    if (!canManageEmployes) {
      toast({
        title: "Non autorisé",
        description: "Vous ne pouvez pas supprimer un employé.",
        variant: "destructive",
      });
      return;
    }
    setEmployerToDelete({ id: e.id, nom: e.nom ?? "", prenom: e.prenom ?? "" });
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setEmployerToDelete(null);
  };

  const confirmDelete = async () => {
    if (!employerToDelete) return;
    setDeleting(true);
    try {
      await api.employers.delete(employerToDelete.id);
      toast({
        title: "Employé supprimé",
        description: `${employerToDelete.nom} ${employerToDelete.prenom} a été supprimé.`,
      });
      closeDeleteDialog();
      loadEmployers();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setDeleting(false);
    }
  };

  const formatSalaire = (s: number | null | undefined): string =>
    s != null ? `${Number(s).toFixed(2)}` : "—";

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Liste des employés</h1>
        <p>
          Nom, prénom et salaire
          {isReadOnly && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Consultation seule
            </span>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-2">
              <h2 className="text-lg font-display font-bold text-foreground">
                Employés
              </h2>
              {canManageEmployes && (
                <Button
                  type="button"
                  onClick={openCreate}
                  className="gap-1.5"
                  size="sm"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </Button>
              )}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Chargement…</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">Id</TableHead>
                  <TableHead className="min-w-[120px]">Nom</TableHead>
                  <TableHead className="min-w-[120px]">Prénom</TableHead>
                  <TableHead className="min-w-[100px]">Salaire</TableHead>
                  {!isReadOnly && (
                    <TableHead className="w-[100px] text-right">
                      Actions
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isReadOnly ? 4 : 5}
                      className="text-center text-muted-foreground py-8"
                    >
                      Aucun employé.
                    </TableCell>
                  </TableRow>
                ) : (
                  employers.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-sm">{e.numeroEmploye ?? "—"}</TableCell>
                      <TableCell className="font-medium">{e.nom}</TableCell>
                      <TableCell>{e.prenom}</TableCell>
                      <TableCell>
                        {formatSalaire(e.salaire ?? undefined)}
                      </TableCell>
                      {!isReadOnly && (
                        <TableCell className="text-right">
                          {canManageEmployes && canUpdate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(e)}
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canManageEmployes && canDelete && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => openDeleteDialog(e)}
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId != null ? "Modifier l'employé" : "Ajouter un employé"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="employe-numero">Id (n° employé)</Label>
              <Input
                id="employe-numero"
                value={formNumeroEmploye}
                onChange={(e) => setFormNumeroEmploye(e.target.value)}
                placeholder="Ex. EMP001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employe-nom">Nom</Label>
              <Input
                id="employe-nom"
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
                placeholder="Nom"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employe-prenom">Prénom</Label>
              <Input
                id="employe-prenom"
                value={formPrenom}
                onChange={(e) => setFormPrenom(e.target.value)}
                placeholder="Prénom"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employe-salaire">Salaire</Label>
              <Input
                id="employe-salaire"
                type="text"
                inputMode="decimal"
                value={formSalaire}
                onChange={(e) => setFormSalaire(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Annuler
            </Button>
            <Button type="button" onClick={handleSubmit}>
              {editingId != null ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (open || !deleting) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;employé</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer{" "}
              <span className="font-medium text-foreground">
                {employerToDelete?.prenom} {employerToDelete?.nom}
              </span>
              ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Suppression…
                </>
              ) : (
                "Supprimer"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
