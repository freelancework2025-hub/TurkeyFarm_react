import AppLayout from "@/components/layout/AppLayout";
import { FileText, TruckIcon, Users, Activity } from "lucide-react";
import { Link } from "react-router-dom";

const STATS = [
  { label: "Bâtiments Actifs", value: "4", icon: Activity, color: "bg-primary" },
  { label: "Entrées ce mois", value: "47", icon: FileText, color: "bg-olive" },
  { label: "Sorties ce mois", value: "12", icon: TruckIcon, color: "bg-farm-green" },
  { label: "Utilisateurs", value: "8", icon: Users, color: "bg-accent" },
];

const QUICK_LINKS = [
  { label: "Reporting Journalier", path: "/reporting-journalier", desc: "Suivi quotidien de mortalité, eau, température" },
  { label: "Sorties Ferme", path: "/sorties-ferme", desc: "Ventes et sorties de dindes" },
  { label: "Fournisseurs", path: "/fournisseurs", desc: "Prix d'aliment par fournisseur" },
  { label: "Livraisons Aliment", path: "/livraisons-aliment", desc: "Suivi des livraisons d'aliment" },
];

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="page-header">
        <h1>Tableau de Bord</h1>
        <p>Bienvenue sur ElevagePro — Vue d'ensemble de votre exploitation</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STATS.map((stat) => (
          <div key={stat.label} className="stat-card flex items-center gap-4 animate-fade-in">
            <div className={`${stat.color} text-primary-foreground p-3 rounded-lg`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <h2 className="text-lg font-display font-bold text-foreground mb-4">Accès Rapide</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className="stat-card group hover:border-accent transition-all animate-fade-in"
          >
            <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">
              {link.label}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
}
