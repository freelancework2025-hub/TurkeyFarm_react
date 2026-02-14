/**
 * API base URL. In dev: backend often runs on 8081 while Vite runs on 8080.
 * Set VITE_API_URL in .env (e.g. VITE_API_URL=http://localhost:8081)
 */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:8081";

const TOKEN_STORAGE_KEY = "elevagepro_token";
const SELECTED_FARM_KEY = "elevagepro_selected_farm";

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, "");
}

export type AuthCredentials = { username: string; password: string };

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Get stored selected farm from session storage.
 */
export function getStoredSelectedFarm(): { id: number; name: string; code: string } | null {
  try {
    const stored = sessionStorage.getItem(SELECTED_FARM_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Store selected farm in session storage.
 */
export function setStoredSelectedFarm(farm: { id: number; name: string; code: string } | null): void {
  try {
    if (farm) sessionStorage.setItem(SELECTED_FARM_KEY, JSON.stringify(farm));
    else sessionStorage.removeItem(SELECTED_FARM_KEY);
  } catch {
    /* ignore */
  }
}

function authHeader(credentials: AuthCredentials | null, token: string | null): HeadersInit {
  if (token) return { Authorization: `Bearer ${token}` };
  if (!credentials) return {};
  const encoded = btoa(`${credentials.username}:${credentials.password}`);
  return { Authorization: `Basic ${encoded}` };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { credentials?: AuthCredentials; token?: string | null; skipAuth?: boolean } = {}
): Promise<T> {
  const { credentials, token: optToken, skipAuth, ...rest } = options as RequestInit & {
    credentials?: AuthCredentials;
    token?: string | null;
    skipAuth?: boolean;
  };
  const token = skipAuth ? null : (optToken ?? getStoredToken());
  const url = path.startsWith("http") ? path : `${getApiBase()}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...authHeader(credentials ?? null, token),
    ...(rest.headers ?? {}),
  };
  const res = await fetch(url, { ...rest, headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(res.status === 401 ? "Unauthorized" : text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
  roleNames?: string[];
}

/**
 * Available roles for login selection.
 */
export const LOGIN_ROLES = [
  { value: 'ADMINISTRATEUR', label: 'Administrateur', requiresFarm: false },
  { value: 'RESPONSABLE_TECHNIQUE', label: 'Responsable Technique', requiresFarm: false },
  { value: 'BACKOFFICE_EMPLOYER', label: 'Backoffice', requiresFarm: false },
  { value: 'RESPONSABLE_FERME', label: 'Responsable de Ferme', requiresFarm: true },
] as const;

/**
 * Login request with role selection and optional farm selection.
 * - ADMINISTRATEUR: farmId is optional (can see all farms' data)
 * - Other roles: farmId is required
 */
export interface LoginRequest {
  username: string;
  password: string;
  role: string;
  farmId?: number | null;
}

/**
 * Auth response with role and optional farm context.
 */
export interface AuthResponse {
  token: string;
  user: UserResponse;
  /** The role selected for this session */
  selectedRole: string;
  /** The farm selected for this session (null if allFarmsMode) */
  selectedFarmId?: number | null;
  selectedFarmName?: string | null;
  selectedFarmCode?: string | null;
  /** True if ADMINISTRATEUR logged in without selecting a farm */
  allFarmsMode: boolean;
}

/**
 * Response from /api/auth/me endpoint
 */
export interface MeResponse {
  user: UserResponse;
  selectedRole?: string;
  selectedFarmId?: number | null;
  selectedFarmName?: string | null;
  selectedFarmCode?: string | null;
  allFarmsMode?: boolean;
}

export const api = {
  auth: {
    /**
     * Get list of farms for login dropdown (public endpoint, no auth required).
     */
    farms: () =>
      apiFetch<FarmResponse[]>("/api/auth/farms", { skipAuth: true }),
    
    /**
     * Login with role selection, credentials, and optional farm selection.
     * - ADMINISTRATEUR: farmId is optional (all-farms mode if null)
     * - Other roles: farmId is required
     */
    login: (username: string, password: string, role: string, farmId?: number | null) =>
      apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, role, farmId: farmId ?? null }),
        skipAuth: true,
      }),
    
    /**
     * Get current user with farm context.
     */
    me: (token?: string | null) =>
      apiFetch<MeResponse>("/api/auth/me", { token: token ?? getStoredToken() }),
  },
  users: {
    list: (token?: string | null) =>
      apiFetch<UserResponse[]>("/api/users", { token: token ?? getStoredToken() }),
    get: (id: number, token?: string | null) =>
      apiFetch<UserResponse>(`/api/users/${id}`, { token: token ?? getStoredToken() }),
    create: (body: UserRequest, token?: string | null) =>
      apiFetch<UserResponse>("/api/users", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    update: (id: number, body: UserRequest, token?: string | null) =>
      apiFetch<UserResponse>(`/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/users/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
    /** Upload profile image (ADMINISTRATEUR or RESPONSABLE_TECHNIQUE only). */
    uploadProfileImage: async (id: number, file: File, token?: string | null): Promise<UserResponse> => {
      const t = token ?? getStoredToken();
      const url = `${getApiBase()}/api/users/${id}/profile-image`;
      const headers: HeadersInit = t ? { Authorization: `Bearer ${t}` } : {};
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(url, { method: "POST", headers, body: formData, credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(res.status === 401 ? "Unauthorized" : text || `HTTP ${res.status}`);
      }
      return res.json() as Promise<UserResponse>;
    },
  },
  roles: {
    list: (token?: string | null) =>
      apiFetch<RoleResponse[]>("/api/roles", { token: token ?? getStoredToken() }),
  },
  farms: {
    /** List farms (requires authentication) */
    list: (token?: string | null) =>
      apiFetch<FarmResponse[]>("/api/farms", { token: token ?? getStoredToken() }),
  },
  /** Effectif mis en place (placement) — optional farmId for Admin/RT to view/create for a specific farm */
  placements: {
    list: (farmId?: number | null, token?: string | null) =>
      apiFetch<PlacementResponse[]>(
        farmId != null ? `/api/placements?farmId=${farmId}` : "/api/placements",
        { token: token ?? getStoredToken() }
      ),
    createBatch: (body: PlacementRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<PlacementResponse[]>(
        farmId != null ? `/api/placements/batch?farmId=${farmId}` : "/api/placements/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Reporting journalier (daily report) — optional farmId for Admin/RT/Backoffice to view/create for a specific farm */
  dailyReports: {
    list: (farmId?: number | null, token?: string | null) =>
      apiFetch<DailyReportResponse[]>(
        farmId != null ? `/api/daily-reports?farmId=${farmId}` : "/api/daily-reports",
        { token: token ?? getStoredToken() }
      ),
    createBatch: (body: DailyReportRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<DailyReportResponse[]>(
        farmId != null ? `/api/daily-reports/batch?farmId=${farmId}` : "/api/daily-reports/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Sorties Ferme — optional farmId for Admin/RT/Backoffice to view/create for a specific farm */
  sorties: {
    list: (farmId?: number | null, token?: string | null) =>
      apiFetch<SortieResponse[]>(
        farmId != null ? `/api/sorties?farmId=${farmId}` : "/api/sorties",
        { token: token ?? getStoredToken() }
      ),
    createBatch: (body: SortieRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<SortieResponse[]>(
        farmId != null ? `/api/sorties/batch?farmId=${farmId}` : "/api/sorties/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/sorties/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Fournisseurs — Prix d'Aliment grid; optional farmId for Admin/RT/Backoffice */
  fournisseurs: {
    getGrid: (farmId?: number | null, token?: string | null) =>
      apiFetch<FournisseurGridResponse>(
        farmId != null ? `/api/fournisseurs/grid?farmId=${farmId}` : "/api/fournisseurs/grid",
        { token: token ?? getStoredToken() }
      ),
    saveGrid: (body: FournisseurGridRequest, farmId?: number | null, token?: string | null) =>
      apiFetch<FournisseurGridResponse>(
        farmId != null ? `/api/fournisseurs/grid?farmId=${farmId}` : "/api/fournisseurs/grid",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
};

// DTOs aligned with backend
export interface RoleResponse {
  id: number;
  name: string;
  description?: string;
}

export interface FarmResponse {
  id: number;
  name: string;
  code: string;
}

export interface UserResponse {
  id: number;
  username: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  /** Profile image path (use profile image API to load with auth) */
  profileImageUrl?: string | null;
  /** True when user has a profile image (avoids 404 if you only request when true) */
  hasProfileImage?: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  roles: RoleResponse[];
  /** Legacy single farm assignment (for backward compatibility) */
  farmId?: number | null;
  farmName?: string | null;
  /** List of farms assigned to this user (for RESPONSABLE_FERME) */
  assignedFarms?: FarmResponse[] | null;
}

export interface UserRequest {
  username?: string;
  password?: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  profileImageUrl?: string | null;
  enabled: boolean;
  roleNames?: string[];
  /** @deprecated Use farmIds for multiple farm assignment */
  farmId?: number | null;
  /** Farm IDs to assign (for RESPONSABLE_FERME: required, for others: optional) */
  farmIds?: number[] | null;
}

/** Effectif mis en place — request (farm is set from JWT on backend) */
export interface PlacementRequest {
  lot: string;
  placementDate: string;
  building: string;
  sex: string;
  initialCount: number;
}

export interface PlacementResponse {
  id: number;
  farmId: number;
  lot: string;
  placementDate: string;
  building: string;
  sex: string;
  initialCount: number;
  createdAt: string;
}

/** Reporting journalier — request (farm is set from JWT on backend) */
export interface DailyReportRequest {
  reportDate: string;
  ageJour?: number | null;
  semaine?: number | null;
  building: string;
  designation: string;
  nbr: number;
  waterL?: number | null;
  tempMin?: number | null;
  tempMax?: number | null;
  traitement?: string | null;
  verified: boolean;
}

export interface DailyReportResponse {
  id: number;
  farmId: number;
  reportDate: string;
  ageJour?: number | null;
  semaine?: number | null;
  building: string;
  designation: string;
  nbr: number;
  waterL?: number | null;
  tempMin?: number | null;
  tempMax?: number | null;
  traitement?: string | null;
  verified: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Sorties Ferme — request (farm from JWT or optional farmId for Admin/RT) */
export interface SortieRequest {
  date?: string | null;
  semaine?: number | null;
  lot?: string | null;
  client?: string | null;
  num_bl?: string | null;
  type?: string | null;
  designation?: string | null;
  nbre_dinde?: number | null;
  qte_brute_kg?: number | null;
  prix_kg?: number | null;
  montant_ttc?: number | null;
}

export interface SortieResponse {
  id: number;
  farmId: number;
  date: string;
  semaine?: number | null;
  lot?: string | null;
  client?: string | null;
  num_bl?: string | null;
  type?: string | null;
  designation?: string | null;
  nbre_dinde?: number | null;
  qte_brute_kg?: number | null;
  prix_kg?: number | null;
  montant_ttc?: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Fournisseurs — Prix d'Aliment grid */
export interface FournisseurItemResponse {
  id: number;
  name: string;
}

export interface AlimentPriceRowResponse {
  fournisseurId: number;
  designation: string;
  price_kg?: number | null;
}

export interface FournisseurGridResponse {
  fournisseurs: FournisseurItemResponse[];
  designations: string[];
  prices: AlimentPriceRowResponse[];
}

export interface FournisseurItemRequest {
  id?: number | null;
  name: string;
}

export interface AlimentPriceCellRequest {
  fournisseur_index: number;
  designation_index: number;
  /** Omit or null for empty cells so they stay empty until user fills and saves */
  price_kg: number | null;
}

export interface FournisseurGridRequest {
  fournisseurs: FournisseurItemRequest[];
  designations: string[];
  prices: AlimentPriceCellRequest[];
}
