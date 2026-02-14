import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { 
  api, 
  getStoredToken, 
  setStoredToken, 
  getStoredSelectedFarm,
  setStoredSelectedFarm,
  type UserResponse 
} from "@/lib/api";

type SelectedFarm = {
  id: number;
  name: string;
  code: string;
} | null;

type AuthState = {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
  /** The role selected at login */
  selectedRole: string | null;
  /** The farm selected at login - establishes data context for the session */
  selectedFarm: SelectedFarm;
  /** True if ADMINISTRATEUR logged in without selecting a farm (can see all farms' data) */
  allFarmsMode: boolean;
};

/**
 * Permission Matrix:
 * | Role                    | Read | Create | Update | Delete |
 * |-------------------------|------|--------|--------|--------|
 * | ADMINISTRATEUR          |  ✓   |   ✓    |   ✓    |   ✓    |
 * | RESPONSABLE_TECHNIQUE   |  ✓   |   ✓    |   ✓    |   ✓    |
 * | BACKOFFICE_EMPLOYER     |  ✓   |   ✗    |   ✗    |   ✗    |
 * | RESPONSABLE_FERME       |  ✓   |   ✓    |   ✗    |   ✗    |
 */
type AuthContextValue = AuthState & {
  /**
   * Login with role selection, credentials, and optional farm selection.
   * - ADMINISTRATEUR: farmId is optional (all-farms mode if null)
   * - Other roles: farmId is required
   * To switch farms/roles, user must logout and login again.
   */
  login: (username: string, password: string, role: string, farmId?: number | null) => Promise<void>;
  logout: () => void;
  /** True if user can manage users (ADMINISTRATEUR or RESPONSABLE_TECHNIQUE). */
  isUserManager: boolean;
  /** @deprecated Use isUserManager. Kept for compatibility. */
  isAdmin: boolean;
  /** 
   * The selected farm ID for this session (from JWT).
   * All data access is filtered by this farm.
   */
  selectedFarmId: number | null;
  selectedFarmName: string | null;
  /** @deprecated Use selectedFarmId. Legacy field for backward compatibility. */
  farmId: number | null;
  /** @deprecated Use selectedFarmName. Legacy field for backward compatibility. */
  farmName: string | null;
  
  // ==================== Permission Properties ====================
  
  /** 
   * True if user can CREATE new platform data records.
   * Allowed: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE, RESPONSABLE_FERME
   */
  canCreate: boolean;
  
  /** 
   * True if user can UPDATE existing platform data records.
   * Allowed: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE only
   * RESPONSABLE_FERME cannot modify data after saving.
   */
  canUpdate: boolean;
  
  /** 
   * True if user can DELETE platform data records.
   * Allowed: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE only
   */
  canDelete: boolean;
  
  /** 
   * True if user has full CRUD access (ADMINISTRATEUR or RESPONSABLE_TECHNIQUE).
   */
  hasFullAccess: boolean;
  
  /**
   * True if user can access all farms (ADMINISTRATEUR, RESPONSABLE_TECHNIQUE, or BACKOFFICE_EMPLOYER).
   * These roles can view data from any farm without being assigned to it.
   */
  canAccessAllFarms: boolean;
  
  /** 
   * True if user is read-only (BACKOFFICE_EMPLOYER).
   * Cannot create, update, or delete any data.
   */
  isReadOnly: boolean;
  
  /** 
   * True if user is RESPONSABLE_FERME.
   * Can only access assigned farms, can create but not update/delete.
   */
  isResponsableFerme: boolean;
  
  /** 
   * True if user is BACKOFFICE_EMPLOYER.
   */
  isBackofficeEmployer: boolean;
  
  /** 
   * True if user is ADMINISTRATEUR.
   */
  isAdministrateur: boolean;
  
  /** 
   * True if user is RESPONSABLE_TECHNIQUE.
   */
  isResponsableTechnique: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SELECTED_ROLE_KEY = "elevagepro_selected_role";
const ALL_FARMS_MODE_KEY = "elevagepro_all_farms_mode";

function getStoredSelectedRole(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_ROLE_KEY);
  } catch {
    return null;
  }
}

function setStoredSelectedRole(role: string | null): void {
  try {
    if (role) sessionStorage.setItem(SELECTED_ROLE_KEY, role);
    else sessionStorage.removeItem(SELECTED_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

function getStoredAllFarmsMode(): boolean {
  try {
    return sessionStorage.getItem(ALL_FARMS_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setStoredAllFarmsMode(mode: boolean): void {
  try {
    if (mode) sessionStorage.setItem(ALL_FARMS_MODE_KEY, 'true');
    else sessionStorage.removeItem(ALL_FARMS_MODE_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    selectedRole: null,
    selectedFarm: null,
    allFarmsMode: false,
  });
  const validatedRef = useRef(false);

  /**
   * Login with role selection and optional farm selection.
   * - ADMINISTRATEUR: farmId is optional (all-farms mode if null)
   * - Other roles: farmId is required
   */
  const login = useCallback(async (username: string, password: string, role: string, farmId?: number | null) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const response = await api.auth.login(username.trim(), password, role, farmId);
      const { token, user, selectedRole, selectedFarmId, selectedFarmName, selectedFarmCode, allFarmsMode } = response;
      
      // Store token, role, and selected farm
      setStoredToken(token);
      setStoredSelectedRole(selectedRole);
      setStoredAllFarmsMode(allFarmsMode);
      
      const selectedFarm = selectedFarmId && selectedFarmName && selectedFarmCode
        ? {
            id: selectedFarmId,
            name: selectedFarmName,
            code: selectedFarmCode,
          }
        : null;
      setStoredSelectedFarm(selectedFarm);
      
      setState((s) => ({ 
        ...s, 
        user, 
        selectedRole,
        selectedFarm,
        allFarmsMode,
        loading: false, 
        error: null 
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Connexion impossible";
      setStoredToken(null);
      setStoredSelectedRole(null);
      setStoredSelectedFarm(null);
      setStoredAllFarmsMode(false);
      setState((s) => ({
        ...s,
        loading: false,
        user: null,
        selectedRole: null,
        selectedFarm: null,
        allFarmsMode: false,
        error: message,
      }));
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setStoredSelectedRole(null);
    setStoredSelectedFarm(null);
    setStoredAllFarmsMode(false);
    setState({
      user: null,
      loading: false,
      error: null,
      selectedRole: null,
      selectedFarm: null,
      allFarmsMode: false,
    });
  }, []);

  useEffect(() => {
    if (validatedRef.current) return;
    const token = getStoredToken();
    const storedFarm = getStoredSelectedFarm();
    const storedRole = getStoredSelectedRole();
    const storedAllFarmsMode = getStoredAllFarmsMode();
    
    // Only call /api/auth/me if we have a token that looks like a JWT
    if (!token || !token.startsWith("eyJ") || token.split(".").length !== 3) {
      if (token) {
        setStoredToken(null);
        setStoredSelectedRole(null);
        setStoredSelectedFarm(null);
        setStoredAllFarmsMode(false);
      }
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    validatedRef.current = true;
    api.auth
      .me()
      .then((response) => {
        // Response can be MeResponse (with user property) or UserResponse directly
        const user = 'user' in response ? response.user : response as unknown as UserResponse;
        const selectedRole = 'selectedRole' in response && response.selectedRole
          ? response.selectedRole
          : storedRole;
        const selectedFarm = 'selectedFarmId' in response && response.selectedFarmId
          ? {
              id: response.selectedFarmId,
              name: response.selectedFarmName || '',
              code: response.selectedFarmCode || '',
            }
          : storedFarm;
        const allFarmsMode = 'allFarmsMode' in response 
          ? response.allFarmsMode ?? false 
          : storedAllFarmsMode;
        
        setState((s) => ({ 
          ...s, 
          user, 
          selectedRole,
          selectedFarm,
          allFarmsMode,
          loading: false, 
          error: null 
        }));
      })
      .catch(() => {
        setStoredToken(null);
        setStoredSelectedRole(null);
        setStoredSelectedFarm(null);
        setStoredAllFarmsMode(false);
        setState((s) => ({ 
          ...s, 
          user: null, 
          selectedRole: null, 
          selectedFarm: null, 
          allFarmsMode: false, 
          loading: false 
        }));
      });
  }, []);

  // ==================== Role Checks ====================
  
  const isAdministrateur = useMemo(
    () => state.user?.roles?.some((r) => r.name === "ADMINISTRATEUR") ?? false,
    [state.user]
  );
  
  const isResponsableTechnique = useMemo(
    () => state.user?.roles?.some((r) => r.name === "RESPONSABLE_TECHNIQUE") ?? false,
    [state.user]
  );
  
  const isResponsableFerme = useMemo(
    () => state.user?.roles?.some((r) => r.name === "RESPONSABLE_FERME") ?? false,
    [state.user]
  );
  
  const isBackofficeEmployer = useMemo(
    () => state.user?.roles?.some((r) => r.name === "BACKOFFICE_EMPLOYER") ?? false,
    [state.user]
  );
  
  // ==================== Permission Calculations ====================
  
  /** ADMINISTRATEUR or RESPONSABLE_TECHNIQUE have full access */
  const hasFullAccess = isAdministrateur || isResponsableTechnique;
  
  /** Can manage users (ADMINISTRATEUR or RESPONSABLE_TECHNIQUE) */
  const isUserManager = hasFullAccess;
  
  /** 
   * Can CREATE: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE, RESPONSABLE_FERME
   * BACKOFFICE_EMPLOYER cannot create
   */
  const canCreate = hasFullAccess || isResponsableFerme;
  
  /** 
   * Can UPDATE: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE only
   * RESPONSABLE_FERME cannot modify after saving
   * BACKOFFICE_EMPLOYER is read-only
   */
  const canUpdate = hasFullAccess;
  
  /** 
   * Can DELETE: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE only
   */
  const canDelete = hasFullAccess;
  
  /** 
   * Read-only: BACKOFFICE_EMPLOYER
   */
  const isReadOnly = isBackofficeEmployer;
  
  /**
   * Can access all farms: ADMINISTRATEUR, RESPONSABLE_TECHNIQUE, BACKOFFICE_EMPLOYER
   * These roles can view data from any farm without being assigned to it.
   */
  const canAccessAllFarms = hasFullAccess || isBackofficeEmployer;

  // Selected farm from session (primary)
  const selectedFarmId = state.selectedFarm?.id ?? null;
  const selectedFarmName = state.selectedFarm?.name ?? null;
  
  // Legacy fields for backward compatibility
  const farmId = selectedFarmId ?? state.user?.farmId ?? null;
  const farmName = selectedFarmName ?? state.user?.farmName ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      isUserManager,
      isAdmin: isUserManager,
      selectedFarmId,
      selectedFarmName,
      farmId,
      farmName,
      // Permission properties
      canCreate,
      canUpdate,
      canDelete,
      hasFullAccess,
      canAccessAllFarms,
      isReadOnly,
      isResponsableFerme,
      isBackofficeEmployer,
      isAdministrateur,
      isResponsableTechnique,
    }),
    [
      state, login, logout, isUserManager, selectedFarmId, selectedFarmName, farmId, farmName,
      canCreate, canUpdate, canDelete, hasFullAccess, canAccessAllFarms, isReadOnly,
      isResponsableFerme, isBackofficeEmployer, isAdministrateur, isResponsableTechnique
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
