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
  X,
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

const NAV_SECTIONS = [
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
      { label: "Reporting Journalier", path: "/reporting-journalier" },
      { label: "Suivi Technique Hebdo", path: "/suivi-technique" },
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
    label: "Profil",
    icon: User,
    path: "/profil",
  },
];

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isUserManager, hasFullAccess, isBackofficeEmployer } = useAuth();
  const showEmployesLink = hasFullAccess || isBackofficeEmployer;
  const [openSections, setOpenSections] = useState<string[]>(["Suivi charge", "Suivi technique", "Suivi de sortie"]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const navSections = NAV_SECTIONS.filter(
    (s) => s.path !== "/utilisateurs" || isUserManager
  );

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

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + minimize */}
      <div className="px-3 py-4 border-b border-sidebar-border flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="text-xl shrink-0" aria-hidden>🦃</span>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-lg font-display font-bold text-sidebar-primary truncate">
                ElevagePro
              </h1>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          aria-label={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
          title={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          {collapsed ? (
            <PanelLeft className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
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
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                  } ${
                    hasActiveChild
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  title={collapsed ? section.label : undefined}
                >
                  <section.icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
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
                {!collapsed && isOpen && (
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
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              } ${
                isActive(section.path!)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
              title={collapsed ? section.label : undefined}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{section.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom links: Liste des employés (Admin / RT / Backoffice only) */}
      {showEmployesLink && (
        <div className={`flex-shrink-0 border-t border-sidebar-border ${collapsed ? "px-2 py-2" : "px-3 py-2"}`}>
          <Link
            to="/employes"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
              collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
            } ${
              location.pathname === "/employes"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
            title={collapsed ? "Liste des employés" : undefined}
          >
            <UserCircle2 className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Liste des employés</span>}
          </Link>
        </div>
      )}

      {/* Footer - fixed at bottom so nav can scroll (zoom > 90%) */}
      <div className={`flex-shrink-0 py-4 border-t border-sidebar-border ${collapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={openLogoutDialog}
          className={`w-full flex items-center gap-3 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
          title={collapsed ? "Déconnexion" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-primary text-primary-foreground p-2 rounded-md shadow-lg"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-in-out lg:translate-x-0 ${
          collapsed ? "w-16 lg:w-16" : "w-64 lg:w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebarContent}
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
