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
  { value: 'RESPONSABLE_TECHNIQUE', label: 'Responsable Technique', requiresFarm: true },
  { value: 'BACKOFFICE_EMPLOYER', label: 'Backoffice', requiresFarm: true },
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
  enabled: boolean;
  roleNames?: string[];
  /** @deprecated Use farmIds for multiple farm assignment */
  farmId?: number | null;
  /** Farm IDs to assign (for RESPONSABLE_FERME: required, for others: optional) */
  farmIds?: number[] | null;
}
