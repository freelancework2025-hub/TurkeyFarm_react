import { useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { User, Mail, Phone, Building2, Shield, BadgeCheck, Camera, Loader2 } from "lucide-react";
import { useProfileImage } from "@/hooks/useProfileImage";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATEUR: "Administrateur",
  RESPONSABLE_TECHNIQUE: "Responsable Technique",
  BACKOFFICE_EMPLOYER: "Backoffice",
  RESPONSABLE_FERME: "Responsable de Ferme",
};

export default function Profile() {
  const { user, selectedRole, selectedFarmName, allFarmsMode, hasFullAccess } = useAuth();
  const { toast } = useToast();
  const [imageRefreshKey, setImageRefreshKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImageUrl = useProfileImage(user?.id ?? null, imageRefreshKey);

  if (!user) {
    return (
      <AppLayout>
        <div className="page-header">
          <h1>Profil</h1>
          <p className="text-muted-foreground">Aucune information utilisateur disponible.</p>
        </div>
      </AppLayout>
    );
  }

  const roleLabel = selectedRole ? ROLE_LABELS[selectedRole] ?? selectedRole : user.roles?.map((r) => ROLE_LABELS[r.name] ?? r.name).join(", ") ?? "—";

  return (
    <AppLayout>
      <div className="page-header">
        <h1>Profil</h1>
        <p>Informations de votre compte — consultation uniquement</p>
      </div>

      <div className="max-w-2xl space-y-6 animate-fade-in">
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center">
                  {profileImageUrl ? (
                    <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                {hasFullAccess && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !user) return;
                        setUploading(true);
                        try {
                          await api.users.uploadProfileImage(user.id, file);
                          setImageRefreshKey((k) => k + 1);
                          toast({ title: "Photo mise à jour" });
                        } catch (err) {
                          toast({
                            title: "Erreur",
                            description: err instanceof Error ? err.message : "Impossible de mettre à jour la photo.",
                            variant: "destructive",
                          });
                        } finally {
                          setUploading(false);
                          e.target.value = "";
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground shadow-md hover:opacity-90 disabled:opacity-50"
                      title="Changer la photo"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-foreground">
                  {user.displayName || user.username}
                </h2>
                <p className="text-sm text-muted-foreground">@{user.username}</p>
              </div>
            </div>
          </div>
          <dl className="divide-y divide-border">
            <div className="px-5 py-4 flex items-start gap-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground min-w-[140px]">
                <Mail className="w-4 h-4 shrink-0" />
                Email
              </dt>
              <dd className="text-sm text-foreground">{user.email || "—"}</dd>
            </div>
            <div className="px-5 py-4 flex items-start gap-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground min-w-[140px]">
                <Phone className="w-4 h-4 shrink-0" />
                Téléphone
              </dt>
              <dd className="text-sm text-foreground">{user.phoneNumber || "—"}</dd>
            </div>
            <div className="px-5 py-4 flex items-start gap-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground min-w-[140px]">
                <Shield className="w-4 h-4 shrink-0" />
                Rôle
              </dt>
              <dd className="text-sm text-foreground">{roleLabel}</dd>
            </div>
            <div className="px-5 py-4 flex items-start gap-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground min-w-[140px]">
                <Building2 className="w-4 h-4 shrink-0" />
                Ferme
              </dt>
              <dd className="text-sm text-foreground">
                {allFarmsMode ? "Toutes les fermes" : selectedFarmName || "—"}
              </dd>
            </div>
            <div className="px-5 py-4 flex items-start gap-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground min-w-[140px]">
                <BadgeCheck className="w-4 h-4 shrink-0" />
                Compte
              </dt>
              <dd className="text-sm">
                <span className={user.enabled ? "text-farm-green font-medium" : "text-destructive"}>
                  {user.enabled ? "Actif" : "Désactivé"}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">
          Pour modifier votre email, nom ou autres informations, contactez un administrateur ou un responsable technique.
        </p>
      </div>
    </AppLayout>
  );
}
