import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { api, type UserResponse, type UserRequest, type RoleResponse, type FarmResponse } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, ShieldAlert, Camera, Loader2, User } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "ADMINISTRATEUR", label: "Administrateur" },
  { value: "RESPONSABLE_TECHNIQUE", label: "Responsable technique" },
  { value: "RESPONSABLE_FERME", label: "Responsable de ferme" },
  { value: "BACKOFFICE_EMPLOYER", label: "Employé Back-office" },
];

function useUsers(isUserManager: boolean, user: { id: number } | null, authLoading: boolean) {
  return useQuery({
    queryKey: ["users", user?.id],
    queryFn: () => api.users.list(),
    enabled: !authLoading && !!user && isUserManager,
  });
}

function useRoles(user: { id: number } | null) {
  return useQuery({
    queryKey: ["roles", user?.id],
    queryFn: () => api.roles.list(),
    enabled: !!user,
  });
}

function useFarms(user: { id: number } | null, isUserManager: boolean) {
  return useQuery({
    queryKey: ["farms"],
    queryFn: () => api.farms.list(),
    enabled: !!user && isUserManager,
    staleTime: 60_000,
  });
}

export default function Utilisateurs() {
  const { user, isUserManager, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading, error } = useUsers(isUserManager, user, authLoading);
  useRoles(user);
  const { data: farms = [], isLoading: farmsLoading, error: farmsError, refetch: refetchFarms } = useFarms(user, isUserManager);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserResponse | null>(null);
  const [profileImageRefreshKey, setProfileImageRefreshKey] = useState(0);
  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const createProfileFileRef = useRef<File | null>(null);
  const [createProfilePreview, setCreateProfilePreview] = useState<string | null>(null);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [form, setForm] = useState<UserRequest & { password?: string; selectedFarmIds?: number[] }>({
    username: "",
    password: "",
    displayName: "",
    email: "",
    phoneNumber: "",
    enabled: true,
    roleNames: [],
    farmId: undefined,
    farmIds: [],
    selectedFarmIds: [],
  });

  const resetForm = () => {
    setEditingUser(null);
    createProfileFileRef.current = null;
    setCreateProfilePreview(null);
    setForm({
      username: "",
      password: "",
      displayName: "",
      email: "",
      phoneNumber: "",
      enabled: true,
      roleNames: [],
      farmId: undefined,
      farmIds: [],
      selectedFarmIds: [],
    });
  };

  const isResponsableFerme = form.roleNames?.[0] === "RESPONSABLE_FERME";

  const createMutation = useMutation({
    mutationFn: (body: UserRequest) => api.users.create(body),
    onSuccess: async (newUser) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      const file = createProfileFileRef.current;
      if (file && newUser?.id) {
        try {
          await api.users.uploadProfileImage(newUser.id, file);
          toast({ title: "Utilisateur créé avec photo" });
        } catch (err) {
          toast({ title: "Utilisateur créé", description: "La photo n'a pas pu être enregistrée.", variant: "destructive" });
        }
        createProfileFileRef.current = null;
      } else {
        toast({ title: "Utilisateur créé" });
      }
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UserRequest }) =>
      api.users.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Utilisateur mis à jour" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.users.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Utilisateur supprimé" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    resetForm();
    setEditingUser(null);
    setDialogOpen(true);
    refetchFarms();
  };

  const openEdit = (u: UserResponse) => {
    setEditingUser(u);
    // Extract farm IDs from assignedFarms or fallback to single farmId
    const assignedFarmIds = u.assignedFarms?.map(f => f.id) ?? (u.farmId ? [u.farmId] : []);
    setForm({
      username: u.username,
      password: "",
      displayName: u.displayName ?? "",
      email: u.email ?? "",
      phoneNumber: u.phoneNumber ?? "",
      enabled: u.enabled,
      roleNames: u.roles?.map((r) => r.name) ?? [],
      farmId: u.farmId ?? undefined,
      farmIds: assignedFarmIds,
      selectedFarmIds: assignedFarmIds,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const roleNames = form.roleNames?.length ? form.roleNames : undefined;
    const selectedFarmIds = form.selectedFarmIds ?? [];
    
    // For RESPONSABLE_FERME, at least one farm is required
    if (isResponsableFerme && selectedFarmIds.length === 0) {
      toast({ title: "Au moins une ferme est obligatoire pour le rôle Responsable de ferme", variant: "destructive" });
      return;
    }
    
    const body: UserRequest = {
      username: form.username?.trim() || form.email?.trim() || undefined,
      displayName: form.displayName?.trim() || undefined,
      email: form.email?.trim() || undefined,
      phoneNumber: form.phoneNumber?.trim() || undefined,
      enabled: form.enabled,
      roleNames,
      // Use farmIds for multi-farm assignment (new model)
      farmIds: isResponsableFerme ? selectedFarmIds : undefined,
      // Keep farmId for backward compatibility (first selected farm)
      farmId: isResponsableFerme && selectedFarmIds.length > 0 ? selectedFarmIds[0] : undefined,
    };
    if (form.password?.trim()) body.password = form.password.trim();
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, body });
    } else {
      if (!body.password) {
        toast({ title: "Mot de passe requis", variant: "destructive" });
        return;
      }
      if (!body.email?.trim() && !body.username?.trim()) {
        toast({ title: "Email ou identifiant requis", variant: "destructive" });
        return;
      }
      createMutation.mutate(body);
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="page-header">
          <h1>Gestion Utilisateurs</h1>
          <p>Accès réservé aux administrateurs</p>
        </div>
        <div className="flex items-center gap-3 p-6 bg-muted/50 rounded-lg border border-border">
          <ShieldAlert className="w-8 h-8 text-muted-foreground" />
          <p className="text-muted-foreground">Vous n'avez pas les droits pour gérer les utilisateurs.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1>Gestion Utilisateurs</h1>
          <p>Créer et gérer les comptes et rôles</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Nouvel utilisateur
        </Button>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
        {error && (
          <div className="p-4 text-destructive text-sm">
            {error instanceof Error ? error.message : "Erreur de chargement"}
          </div>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Chargement...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Photo</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead>Ferme</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                // Display assigned farms or fallback to single farm
                const farmDisplay = u.assignedFarms && u.assignedFarms.length > 0
                  ? u.assignedFarms.map(f => f.name).join(", ")
                  : u.farmName ?? "—";
                const farmCount = u.assignedFarms?.length ?? (u.farmId ? 1 : 0);
                
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <UserAvatar userId={u.id} hasProfileImage={u.hasProfileImage} size="sm" />
                    </TableCell>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.displayName ?? "—"}</TableCell>
                    <TableCell>{u.email ?? "—"}</TableCell>
                    <TableCell>{u.phoneNumber ?? "—"}</TableCell>
                    <TableCell>
                      {u.roles?.map((r) => r.name).join(", ") ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <span className="truncate block" title={farmDisplay}>
                          {farmDisplay}
                        </span>
                        {farmCount > 1 && (
                          <span className="text-xs text-muted-foreground">
                            ({farmCount} fermes)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{u.enabled ? "Oui" : "Non"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(u)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="sm:max-w-md max-h-[90vh] flex flex-col p-0 gap-0"
          aria-describedby="user-dialog-description"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>{editingUser ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
            <DialogDescription id="user-dialog-description">
              {editingUser ? "Modifier les informations et le rôle de l'utilisateur." : "Créer un nouveau compte. Choisissez le rôle et, pour Responsable de ferme, les fermes."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-2 space-y-4">
            {isUserManager && (
              <div className="flex items-center gap-4 pb-2 border-b border-border">
                {editingUser ? (
                  <>
                    <UserAvatar userId={editingUser.id} hasProfileImage={editingUser.hasProfileImage} refreshKey={profileImageRefreshKey} size="lg" />
                    <div>
                      <p className="text-sm font-medium">Photo de profil</p>
                      <input
                        ref={profileFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !editingUser) return;
                          setUploadingProfile(true);
                          try {
                            await api.users.uploadProfileImage(editingUser.id, file);
                            setProfileImageRefreshKey((k) => k + 1);
                            queryClient.invalidateQueries({ queryKey: ["users"] });
                            toast({ title: "Photo mise à jour" });
                          } catch (err) {
                            toast({
                              title: "Erreur",
                              description: err instanceof Error ? err.message : "Impossible de mettre à jour la photo.",
                              variant: "destructive",
                            });
                          } finally {
                            setUploadingProfile(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => profileFileInputRef.current?.click()}
                        disabled={uploadingProfile}
                      >
                        {uploadingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        {" "}Changer la photo
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
                      {createProfilePreview ? (
                        <img src={createProfilePreview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Photo de profil (optionnel)</p>
                      <input
                        ref={profileFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          createProfileFileRef.current = file ?? null;
                          if (file) {
                            const url = URL.createObjectURL(file);
                            setCreateProfilePreview((prev) => {
                              if (prev) URL.revokeObjectURL(prev);
                              return url;
                            });
                          } else {
                            setCreateProfilePreview((prev) => {
                              if (prev) URL.revokeObjectURL(prev);
                              return null;
                            });
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => profileFileInputRef.current?.click()}
                      >
                        <Camera className="w-4 h-4" />
                        {" "}{createProfilePreview ? "Changer la photo" : "Ajouter une photo"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div>
              <Label>Identifiant (ou laisser vide pour utiliser l’email)</Label>
              <Input
                value={form.username ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="nom d'utilisateur ou email"
                disabled={!!editingUser}
              />
            </div>
              <div>
                <Label>Nom affiché</Label>
                <Input
                  value={form.displayName ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Nom complet"
                />
              </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemple.com"
              />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input
                value={form.phoneNumber ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                placeholder="+212 6 00 00 00 00"
              />
            </div>
            {!editingUser && (
              <div>
                <Label>Mot de passe</Label>
                <Input
                  type="password"
                  value={form.password ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  required={!editingUser}
                />
              </div>
            )}
            {editingUser && (
              <div>
                <Label>Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
                <Input
                  type="password"
                  value={form.password ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
            )}
            <div>
              <Label>Rôles</Label>
              <Select
                value={form.roleNames?.[0] ?? ""}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    roleNames: v ? [v] : [],
                    farmId: v === "RESPONSABLE_FERME" ? f.farmId : undefined,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isResponsableFerme && (
              <div>
                <Label>Fermes assignées (obligatoire pour Responsable de ferme)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Sélectionnez une ou plusieurs fermes auxquelles cet utilisateur aura accès.
                </p>
                {farmsError && (
                  <p className="text-sm text-destructive mb-1">
                    Impossible de charger les fermes. Vérifiez la connexion au serveur.
                  </p>
                )}
                {farmsLoading ? (
                  <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
                    Chargement des fermes...
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-input rounded-md p-2 bg-muted/30">
                    {farms.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">Aucune ferme disponible</p>
                    ) : (
                      farms.map((farm) => {
                        const isSelected = form.selectedFarmIds?.includes(farm.id) ?? false;
                        return (
                          <label
                            key={farm.id}
                            className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                              isSelected 
                                ? 'bg-primary/10 border border-primary/30' 
                                : 'hover:bg-muted/50 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setForm((f) => {
                                  const currentIds = f.selectedFarmIds ?? [];
                                  const newIds = e.target.checked
                                    ? [...currentIds, farm.id]
                                    : currentIds.filter(id => id !== farm.id);
                                  return { ...f, selectedFarmIds: newIds };
                                });
                              }}
                              className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
                            />
                            <span className={`text-sm ${isSelected ? 'font-medium text-primary' : ''}`}>
                              {farm.name}
                            </span>
                            <span className="text-xs text-muted-foreground">({farm.code})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
                {(form.selectedFarmIds?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {form.selectedFarmIds?.length} ferme(s) sélectionnée(s)
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
              <Label htmlFor="enabled">Compte actif</Label>
            </div>
            </div>
            <DialogFooter className="shrink-0 flex-row gap-2 justify-end px-6 py-4 border-t bg-muted/30 rounded-b-lg">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingUser ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>L'utilisateur &quot;{deleteTarget.username}&quot; sera définitivement supprimé.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
