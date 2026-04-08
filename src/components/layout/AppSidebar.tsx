import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Wallet,
  ClipboardList,
  TruckIcon,
  Users,
  User,
  UserCircle2,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_SECTIONS_BASE = [
  {
    label: "Tableau de bord",
    icon: LayoutDashboard,
    path: "/dashboard",
  },
  {
    label: "Suivi charge",
    icon: Wallet,
    children: [
      { label: "Livraisons Aliment", path: "/livraisons-aliment" },
      { label: "Produits Vétérinaires", path: "/produits-veterinaires" },
      { label: "Produits Hygiène", path: "/produits-hygiene" },
      { label: "Électricité", path: "/electricite" },
      { label: "Livraisons Paille", path: "/livraisons-paille" },
      { label: "Main d'Œuvre", path: "/main-oeuvre" },
      { label: "Livraisons Gaz", path: "/livraisons-gaz" },
      { label: "Dépenses Divers", path: "/depenses-divers" },
      { label: "Fournisseurs", path: "/fournisseurs" },
    ],
  },
  {
    label: "Suivi technique",
    icon: ClipboardList,
    children: [
      { label: "Données mises en place", path: "/infos-setup" },
      { label: "Reporting Journalier", path: "/reporting-journalier" },
      { label: "Suivi Technique Hebdo", path: "/suivi-technique-hebdomadaire" },
      { label: "Planning de vaccination", path: "/planning-vaccination", rolesOnly: ["ADMINISTRATEUR", "RESPONSABLE_TECHNIQUE", "BACKOFFICE_EMPLOYER", "RESPONSABLE_FERME"] as const },
    ],
  },
  {
    label: "Suivi de sortie",
    icon: TruckIcon,
    children: [
      { label: "Sorties Ferme", path: "/sorties-ferme" },
    ],
  },
  {
    label: "Gestion Utilisateurs",
    icon: Users,
    path: "/utilisateurs",
  },
  {
    label: "Liste des employés",
    icon: UserCircle2,
    path: "/employes",
    requiresEmployesAccess: true,
  },
  {
    label: "Profil",
    icon: User,
    path: "/profil",
  },
];

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, canManageUsers, hasFullAccess, isBackofficeEmployer, user } = useAuth();
  const showEmployesLink = hasFullAccess || isBackofficeEmployer;
  const [openSections, setOpenSections] = useState<string[]>(["Suivi charge", "Suivi technique", "Suivi de sortie"]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const userRoles = new Set((user?.roles ?? []).map((r) => r.name ?? ""));

  const navSections = NAV_SECTIONS_BASE.map((section) => {
    if ("requiresEmployesAccess" in section && section.requiresEmployesAccess && !showEmployesLink) return null;
    if (section.path !== undefined && section.path !== "/utilisateurs") return section;
    if (section.path === "/utilisateurs" && !canManageUsers) return null;
    if (!section.children) return section;
    const filteredChildren = section.children.filter((child: { label: string; path: string; rolesOnly?: readonly string[] }) => {
      if (!child.rolesOnly) return true;
      return child.rolesOnly.some((role) => userRoles.has(role));
    });
    return { ...section, children: filteredChildren };
  }).filter(Boolean) as typeof NAV_SECTIONS_BASE;

  const openLogoutDialog = () => {
    setMobileOpen(false);
    setLogoutDialogOpen(true);
  };

  const confirmLogout = () => {
    logout();
    setLogoutDialogOpen(false);
    navigate("/auth", { replace: true });
  };

  const toggleSection = (label: string) => {
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const isActive = (path: string) => location.pathname === path;

  const renderSidebarContent = (opts?: { hideCollapse?: boolean; forceExpanded?: boolean }) => {
    const effectiveCollapsed = opts?.forceExpanded ? false : collapsed;
    return (
    <div className="flex flex-col h-full">
      {/* Logo + minimize / close (mobile) */}
      <div className="px-3 py-4 border-b border-sidebar-border flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="text-xl shrink-0" aria-hidden>🦃</span>
          {!effectiveCollapsed && (
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold text-sidebar-primary truncate">
                ElevagePro
              </h1>
            </div>
          )}
        </div>
        {!opts?.hideCollapse && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            aria-label={effectiveCollapsed ? "Ouvrir le menu" : "Réduire le menu"}
            title={effectiveCollapsed ? "Ouvrir le menu" : "Réduire le menu"}
          >
            {effectiveCollapsed ? (
              <PanelLeft className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* Navigation - scrollable */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-2 space-y-1">
        {navSections.map((section) => {
          if (section.children) {
            const isOpen = openSections.includes(section.label);
            const hasActiveChild = section.children.some((c) =>
              isActive(c.path)
            );
            return (
              <div key={section.label}>
                <button
                  onClick={() => {
                    if (collapsed) setCollapsed(false);
                    else toggleSection(section.label);
                  }}
                  className={`w-full flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
                    effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                  } ${
                    hasActiveChild
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  title={effectiveCollapsed ? section.label : undefined}
                >
                  <section.icon className="w-4 h-4 shrink-0" />
                  {!effectiveCollapsed && (
                    <>
                      <span className="flex-1 text-left">{section.label}</span>
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </>
                  )}
                </button>
                {!effectiveCollapsed && isOpen && (
                  <div className="ml-7 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                    {section.children.map((child) => (
                      <Link
                        key={child.path}
                        to={child.path}
                        onClick={() => setMobileOpen(false)}
                        className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive(child.path)
                            ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={section.path}
              to={section.path!}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
                effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              } ${
                isActive(section.path!)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
              title={effectiveCollapsed ? section.label : undefined}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              {!effectiveCollapsed && <span>{section.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer - fixed at bottom so nav can scroll (zoom > 90%) */}
      <div className={`flex-shrink-0 py-4 border-t border-sidebar-border ${effectiveCollapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={openLogoutDialog}
          className={`w-full flex items-center gap-3 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors ${effectiveCollapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
          title={effectiveCollapsed ? "Déconnexion" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!effectiveCollapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </div>
  );
  };

  return (
    <>
      {/* Mobile: Sheet (drawer) - close button at top-right, no overlap */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed top-4 left-4 z-50 lg:hidden bg-primary text-primary-foreground p-2 rounded-md shadow-lg"
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-64 max-w-[85vw] p-0 gap-0 bg-sidebar text-sidebar-foreground border-sidebar-border [&>button]:text-sidebar-foreground [&>button]:hover:bg-sidebar-accent [&>button]:right-3 [&>button]:top-4"
        >
          {renderSidebarContent({ hideCollapse: true, forceExpanded: true })}
        </SheetContent>
      </Sheet>

      {/* Desktop: sidebar (sticky, collapsible) */}
      <aside
        className={`hidden lg:flex fixed lg:sticky top-0 left-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out flex-col ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* Logout confirmation */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déconnexion</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment vous déconnecter ? Vous devrez vous reconnecter pour accéder à l&apos;application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button variant="default" onClick={confirmLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Déconnexion
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
