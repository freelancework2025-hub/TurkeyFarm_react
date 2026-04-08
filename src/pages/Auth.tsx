import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import farmHero from "@/assets/farm-hero.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FarmResponse, LOGIN_ROLES } from "@/lib/api";
import { Building2, ChevronDown, UserCog } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const { user, login, error, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(null);
  
  // Role dropdown state
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  
  // Farm dropdown state
  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(true);
  const [farmsError, setFarmsError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Check if selected role requires farm selection
  const selectedRoleConfig = LOGIN_ROLES.find(r => r.value === selectedRole);
  const requiresFarm = selectedRoleConfig?.requiresFarm ?? true;

  // Fetch farms on mount (public endpoint)
  useEffect(() => {
    const fetchFarms = async () => {
      try {
        setFarmsLoading(true);
        setFarmsError(null);
        const farmsList = await api.auth.farms();
        setFarms(farmsList);
        // Auto-select first farm if only one available
        if (farmsList.length === 1) {
          setSelectedFarmId(farmsList[0].id);
        }
      } catch (e) {
        setFarmsError(e instanceof Error ? e.message : "Impossible de charger les fermes");
      } finally {
        setFarmsLoading(false);
      }
    };
    fetchFarms();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) {
      return; // Role selection is required
    }
    if (requiresFarm && !selectedFarmId) {
      return; // Farm selection is required for this role
    }
    try {
      await login(username.trim(), password, selectedRole, requiresFarm ? selectedFarmId : null);
      navigate("/dashboard", { replace: true });
    } catch {
      // error is set in context
    }
  };

  const selectedFarm = farms.find(f => f.id === selectedFarmId);

  return (
    <div className="min-h-screen flex">
      {/* Left: image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src={farmHero}
          alt="Ferme de dindes"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary/40" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-primary-foreground">
          <h1 className="text-4xl font-display font-bold mb-3">
            ElevagePro
          </h1>
          <p className="text-lg opacity-90 max-w-md">
            ElevagePro — Plateforme de gestion digitale pour l'élevage de dindes. Suivi
            quotidien, traçabilité complète, gestion simplifiée.
          </p>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background lg:bg-background relative">
        {/* Mobile background image */}
        <div className="lg:hidden absolute inset-0 z-0">
          <img
            src={farmHero}
            alt="Ferme de dindes"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background/95" />
        </div>
        
        <div className="w-full max-w-md animate-fade-in relative z-10">
          <div className="lg:hidden mb-8 text-center">
            <h1 className="text-3xl font-display font-bold text-primary">
              🦃 ElevagePro
            </h1>
          </div>

          <div className="bg-card rounded-xl shadow-lg border border-border p-8">
            <h2 className="text-xl font-display font-bold text-foreground mb-1">
              Connexion
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Sélectionnez votre rôle et entrez vos identifiants pour accéder à la plateforme.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role Selection Dropdown */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  <UserCog className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
                  Rôle
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                    className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <span className={selectedRoleConfig ? "text-foreground" : "text-muted-foreground"}>
                      {selectedRoleConfig 
                        ? selectedRoleConfig.label 
                        : "Sélectionnez votre rôle"}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {roleDropdownOpen && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setRoleDropdownOpen(false)}
                      />
                      {/* Dropdown menu */}
                      <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                        {LOGIN_ROLES.map((role) => (
                          <button
                            key={role.value}
                            type="button"
                            onClick={() => {
                              setSelectedRole(role.value);
                              setRoleDropdownOpen(false);
                              // Clear farm selection if switching to a role that doesn't require it
                              if (!role.requiresFarm) {
                                setSelectedFarmId(null);
                              }
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                              selectedRole === role.value 
                                ? 'bg-primary/10 text-primary font-medium' 
                                : 'text-foreground'
                            }`}
                          >
                            <span className="font-medium">{role.label}</span>
                            {!role.requiresFarm && (
                              <span className="ml-2 text-xs text-muted-foreground">(accès toutes fermes)</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {!selectedRole && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Vous devez sélectionner votre rôle pour vous connecter
                  </p>
                )}
              </div>
              
              {/* Farm Selection Dropdown - Only shown if role requires it */}
              {selectedRole && requiresFarm && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    <Building2 className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
                    Ferme
                  </label>
                  {farmsError ? (
                    <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-md">
                      {farmsError}
                      <button 
                        type="button"
                        onClick={() => window.location.reload()}
                        className="ml-2 underline hover:no-underline"
                      >
                        Réessayer
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        disabled={farmsLoading}
                        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      >
                        <span className={selectedFarm ? "text-foreground" : "text-muted-foreground"}>
                          {farmsLoading 
                            ? "Chargement des fermes..." 
                            : selectedFarm 
                              ? selectedFarm.name 
                              : "Sélectionnez une ferme"}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {dropdownOpen && !farmsLoading && (
                        <>
                          {/* Backdrop to close dropdown */}
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setDropdownOpen(false)}
                          />
                          {/* Dropdown menu */}
                          <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                            {farms.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Aucune ferme disponible
                              </div>
                            ) : (
                              farms.map((farm) => (
                                <button
                                  key={farm.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedFarmId(farm.id);
                                    setDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                                    selectedFarmId === farm.id 
                                      ? 'bg-primary/10 text-primary font-medium' 
                                      : 'text-foreground'
                                  }`}
                                >
                                  <span className="font-medium">{farm.name}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">({farm.code})</span>
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {!selectedFarmId && !farmsLoading && !farmsError && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Vous devez sélectionner une ferme pour vous connecter
                    </p>
                  )}
                </div>
              )}
              
              {/* All-farms mode message for roles that can access all farms */}
              {(selectedRole === 'ADMINISTRATEUR' || selectedRole === 'RESPONSABLE_TECHNIQUE' || selectedRole === 'BACKOFFICE_EMPLOYER') && !requiresFarm && (
                <div className="p-3 bg-primary/10 rounded-md border border-primary/20">
                  <p className="text-sm text-primary">
                    <strong>Mode toutes fermes:</strong> Vous aurez accès aux données de toutes les fermes.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Identifiant ou email
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="email ou nom d'utilisateur"
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !selectedRole || (requiresFarm && (!selectedFarmId || farmsLoading))}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-md font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
              
              {selectedFarm && requiresFarm && (
                <p className="text-xs text-center text-muted-foreground">
                  Vous accéderez aux données de la ferme <strong>{selectedFarm.name}</strong>
                </p>
              )}
              
              {(selectedRole === 'ADMINISTRATEUR' || selectedRole === 'RESPONSABLE_TECHNIQUE' || selectedRole === 'BACKOFFICE_EMPLOYER') && !requiresFarm && (
                <p className="text-xs text-center text-muted-foreground">
                  Vous accéderez aux données de <strong>toutes les fermes</strong>
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
