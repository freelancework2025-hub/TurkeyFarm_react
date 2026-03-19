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

/**
 * Parse API error response. Extracts user-facing message from Spring ProblemDetail
 * (RFC 7807) when available; otherwise returns a generic message.
 */
function parseApiErrorMessage(text: string, status: number): string {
  if (status === 401) return "Session expirée. Veuillez vous reconnecter.";
  try {
    if (text?.trim()) {
      const body = JSON.parse(text) as { detail?: string; userMessage?: string; message?: string };
      const msg = body.detail ?? body.userMessage ?? body.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  } catch {
    /* ignore */
  }
  return "Une erreur est survenue.";
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
    const msg = parseApiErrorMessage(text, res.status);
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text || text.trim() === "") return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Like apiFetch but returns null when response is 204 or body is empty/invalid.
 * Use for endpoints that may return "no data" (e.g. dashboard summary for a farm with no reports).
 */
async function apiFetchOrNull<T>(
  path: string,
  options: RequestInit & { token?: string | null; skipAuth?: boolean } = {}
): Promise<T | null> {
  const { token: optToken, skipAuth, ...rest } = options;
  const token = skipAuth ? null : (optToken ?? getStoredToken());
  const url = path.startsWith("http") ? path : `${getApiBase()}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...authHeader(null, token),
    ...(rest.headers ?? {}),
  };
  const res = await fetch(url, { ...rest, headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(text, res.status));
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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
        throw new Error(parseApiErrorMessage(text, res.status));
      }
      return res.json() as Promise<UserResponse>;
    },
    /** Delete profile image (ADMINISTRATEUR or RESPONSABLE_TECHNIQUE only). */
    deleteProfileImage: async (id: number, token?: string | null): Promise<void> => {
      const t = token ?? getStoredToken();
      const url = `${getApiBase()}/api/users/${id}/profile-image`;
      const headers: HeadersInit = t ? { Authorization: `Bearer ${t}` } : {};
      const res = await fetch(url, { method: "DELETE", headers, credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(parseApiErrorMessage(text, res.status));
      }
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
    /** List distinct lot numbers for a farm (from placements). Used for lot selector boxes. */
    lots: (farmId: number, token?: string | null) =>
      apiFetch<string[]>(`/api/farms/${farmId}/lots`, { token: token ?? getStoredToken() }),
    /** List lots for a farm with closed/open status. Closed lots appear grey; only RT/Admin can close/open. */
    lotsWithStatus: (farmId: number, token?: string | null) =>
      apiFetch<LotWithStatusResponse[]>(`/api/farms/${farmId}/lots/status`, { token: token ?? getStoredToken() }),
    /** Close a lot (ADMINISTRATEUR and RESPONSABLE_TECHNIQUE only). Other roles cannot access closed lots. */
    closeLot: (farmId: number, lot: string, token?: string | null) =>
      apiFetch<void>(`/api/farms/${farmId}/lots/${encodeURIComponent(lot)}/close`, { method: "POST", token: token ?? getStoredToken() }),
    /** Open a lot (ADMINISTRATEUR and RESPONSABLE_TECHNIQUE only). */
    openLot: (farmId: number, lot: string, token?: string | null) =>
      apiFetch<void>(`/api/farms/${farmId}/lots/${encodeURIComponent(lot)}/open`, { method: "POST", token: token ?? getStoredToken() }),
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
    /** Replace all placements for the farm (delete existing then create). Use when saving after row deletions to avoid duplicates. Requires farm scope. */
    replaceBatch: (body: PlacementRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<PlacementResponse[]>(
        farmId != null ? `/api/placements/replace?farmId=${farmId}` : "/api/placements/replace",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Setup information — extended placement data for reuse across weeks */
  setupInfo: {
    list: (farmId?: number | null, lot?: string | null, token?: string | null) => {
      const params = new URLSearchParams();
      if (farmId != null) params.set("farmId", String(farmId));
      if (lot != null && lot !== "") params.set("lot", lot);
      return apiFetch<SetupInfoResponse[]>(
        `/api/setup-info${params.toString() ? `?${params.toString()}` : ""}`,
        { token: token ?? getStoredToken() }
      );
    },
    createBatch: (body: SetupInfoRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<SetupInfoResponse[]>(
        farmId != null ? `/api/setup-info/batch?farmId=${farmId}` : "/api/setup-info/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    /** Replace all setup info for the farm and lot (delete existing then create). */
    replaceBatch: (body: SetupInfoRequest[], farmId?: number | null, lot?: string | null, token?: string | null) => {
      const params = new URLSearchParams();
      if (farmId != null) params.set("farmId", String(farmId));
      if (lot != null && lot !== "") params.set("lot", lot);
      return apiFetch<SetupInfoResponse[]>(
        `/api/setup-info/replace${params.toString() ? `?${params.toString()}` : ""}`,
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      );
    },
  },
  /** Reporting journalier (daily report) — optional farmId for Admin/RT/Backoffice to view/create for a specific farm */
  dailyReports: {
    list: (farmId?: number | null, lot?: string | null, token?: string | null) => {
      const params = new URLSearchParams();
      if (farmId != null) params.set("farmId", String(farmId));
      if (lot != null && lot.trim() !== "") params.set("lot", lot.trim());
      const queryString = params.toString();
      return apiFetch<DailyReportResponse[]>(
        queryString ? `/api/daily-reports?${queryString}` : "/api/daily-reports",
        { token: token ?? getStoredToken() }
      );
    },
    createBatch: (body: DailyReportRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<DailyReportResponse[]>(
        farmId != null ? `/api/daily-reports/batch?farmId=${farmId}` : "/api/daily-reports/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    /** Replace all reports for a date (delete existing then create). Use when saving after row deletions to avoid duplicates. */
    replaceBatch: (reportDate: string, body: DailyReportRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<DailyReportResponse[]>(
        `/api/daily-reports/replace?reportDate=${encodeURIComponent(reportDate)}${farmId != null ? `&farmId=${farmId}` : ""}`,
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: DailyReportRequest, token?: string | null) =>
      apiFetch<DailyReportResponse>(`/api/daily-reports/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/daily-reports/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
    /** Get dashboard summary for the latest day (lot optional - if not provided, finds most recent lot automatically). Returns null when the farm has no report data (empty response). */
    getDashboardSummary: (farmId?: number | null, lot?: string | null, token?: string | null) => {
      const params = new URLSearchParams();
      if (farmId != null) params.set("farmId", String(farmId));
      if (lot != null && lot.trim() !== "") params.set("lot", lot.trim());
      const queryString = params.toString();
      return apiFetchOrNull<DailyDashboardSummary>(
        `/api/daily-reports/dashboard-summary${queryString ? `?${queryString}` : ""}`,
        { token: token ?? getStoredToken() }
      );
    },
  },
  /** Sorties Ferme — optional farmId, lot and semaine for filtering */
  sorties: {
    list: (params?: { farmId?: number | null; lot?: string | null; semaine?: number | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      if (params?.semaine != null) search.set("semaine", String(params.semaine));
      const qs = search.toString();
      return apiFetch<SortieResponse[]>(
        qs ? `/api/sorties?${qs}` : "/api/sorties",
        { token: token ?? getStoredToken() }
      );
    },
    createBatch: (body: SortieRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<SortieResponse[]>(
        farmId != null ? `/api/sorties/batch?farmId=${farmId}` : "/api/sorties/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: SortieRequest, token?: string | null) =>
      apiFetch<SortieResponse>(`/api/sorties/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
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
  /** Livraisons Aliment — optional farmId, lot, sem for filtering */
  livraisonsAliment: {
    list: (params?: { farmId?: number | null; lot?: string | null; sem?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      if (params?.sem != null && params.sem !== "") search.set("sem", params.sem);
      const qs = search.toString();
      return apiFetch<LivraisonAlimentResponse[]>(
        qs ? `/api/livraisons-aliment?${qs}` : "/api/livraisons-aliment",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<LivraisonAlimentResponse>(`/api/livraisons-aliment/${id}`, { token: token ?? getStoredToken() }),
    create: (body: LivraisonAlimentRequest, token?: string | null) =>
      apiFetch<LivraisonAlimentResponse>("/api/livraisons-aliment", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: LivraisonAlimentRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<LivraisonAlimentResponse[]>(
        farmId != null ? `/api/livraisons-aliment/batch?farmId=${farmId}` : "/api/livraisons-aliment/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: LivraisonAlimentRequest, token?: string | null) =>
      apiFetch<LivraisonAlimentResponse>(`/api/livraisons-aliment/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/livraisons-aliment/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Livraisons Produits Vétérinaires — optional farmId, lot for filtering */
  livraisonsProduitsVeterinaires: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<LivraisonProduitVeterinaireResponse[]>(
        qs ? `/api/livraisons-produits-veterinaires?${qs}` : "/api/livraisons-produits-veterinaires",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<LivraisonProduitVeterinaireResponse>(`/api/livraisons-produits-veterinaires/${id}`, { token: token ?? getStoredToken() }),
    create: (body: LivraisonProduitVeterinaireRequest, token?: string | null) =>
      apiFetch<LivraisonProduitVeterinaireResponse>("/api/livraisons-produits-veterinaires", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: LivraisonProduitVeterinaireRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<LivraisonProduitVeterinaireResponse[]>(
        farmId != null ? `/api/livraisons-produits-veterinaires/batch?farmId=${farmId}` : "/api/livraisons-produits-veterinaires/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: LivraisonProduitVeterinaireRequest, token?: string | null) =>
      apiFetch<LivraisonProduitVeterinaireResponse>(`/api/livraisons-produits-veterinaires/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/livraisons-produits-veterinaires/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Livraisons Produits Hygiène — optional farmId, lot for filtering */
  livraisonsProduitsHygiene: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<LivraisonProduitHygieneResponse[]>(
        qs ? `/api/livraisons-produits-hygiene?${qs}` : "/api/livraisons-produits-hygiene",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<LivraisonProduitHygieneResponse>(`/api/livraisons-produits-hygiene/${id}`, { token: token ?? getStoredToken() }),
    create: (body: LivraisonProduitHygieneRequest, token?: string | null) =>
      apiFetch<LivraisonProduitHygieneResponse>("/api/livraisons-produits-hygiene", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: LivraisonProduitHygieneRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<LivraisonProduitHygieneResponse[]>(
        farmId != null ? `/api/livraisons-produits-hygiene/batch?farmId=${farmId}` : "/api/livraisons-produits-hygiene/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: LivraisonProduitHygieneRequest, token?: string | null) =>
      apiFetch<LivraisonProduitHygieneResponse>(`/api/livraisons-produits-hygiene/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/livraisons-produits-hygiene/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Vide sanitaire Hygiène (Produits Hygiène) — one record per farm/lot; only qte, prixPerUnit, montant */
  videSanitaire: {
    get: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<VideSanitaireResponse | null>(
        qs ? `/api/vide-sanitaire-hygiene?${qs}` : "/api/vide-sanitaire-hygiene",
        { token: token ?? getStoredToken() }
      );
    },
    put: (body: VideSanitaireRequest, farmId?: number | null, token?: string | null) =>
      apiFetch<VideSanitaireResponse>(
        farmId != null ? `/api/vide-sanitaire-hygiene?farmId=${farmId}` : "/api/vide-sanitaire-hygiene",
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Livraisons Paille — optional farmId, lot for filtering */
  livraisonsPaille: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<LivraisonPailleResponse[]>(
        qs ? `/api/livraisons-paille?${qs}` : "/api/livraisons-paille",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<LivraisonPailleResponse>(`/api/livraisons-paille/${id}`, { token: token ?? getStoredToken() }),
    create: (body: LivraisonPailleRequest, token?: string | null) =>
      apiFetch<LivraisonPailleResponse>("/api/livraisons-paille", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: LivraisonPailleRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<LivraisonPailleResponse[]>(
        farmId != null ? `/api/livraisons-paille/batch?farmId=${farmId}` : "/api/livraisons-paille/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: LivraisonPailleRequest, token?: string | null) =>
      apiFetch<LivraisonPailleResponse>(`/api/livraisons-paille/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/livraisons-paille/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Vide sanitaire Paille — one record per farm/lot */
  videSanitairePaille: {
    get: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<VideSanitairePailleResponse | null>(
        qs ? `/api/vide-sanitaire-paille?${qs}` : "/api/vide-sanitaire-paille",
        { token: token ?? getStoredToken() }
      );
    },
    put: (body: VideSanitairePailleRequest, farmId?: number | null, token?: string | null) =>
      apiFetch<VideSanitairePailleResponse>(
        farmId != null ? `/api/vide-sanitaire-paille?farmId=${farmId}` : "/api/vide-sanitaire-paille",
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Livraisons Électricité — optional farmId, lot for filtering */
  livraisonsElectricite: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<LivraisonElectriciteResponse[]>(
        qs ? `/api/livraisons-electricite?${qs}` : "/api/livraisons-electricite",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<LivraisonElectriciteResponse>(`/api/livraisons-electricite/${id}`, { token: token ?? getStoredToken() }),
    create: (body: LivraisonElectriciteRequest, token?: string | null) =>
      apiFetch<LivraisonElectriciteResponse>("/api/livraisons-electricite", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: LivraisonElectriciteRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<LivraisonElectriciteResponse[]>(
        farmId != null ? `/api/livraisons-electricite/batch?farmId=${farmId}` : "/api/livraisons-electricite/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: LivraisonElectriciteRequest, token?: string | null) =>
      apiFetch<LivraisonElectriciteResponse>(`/api/livraisons-electricite/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/livraisons-electricite/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Livraisons Gaz — optional farmId, lot for filtering */
  livraisonsGaz: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<LivraisonGazResponse[]>(
        qs ? `/api/livraisons-gaz?${qs}` : "/api/livraisons-gaz",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<LivraisonGazResponse>(`/api/livraisons-gaz/${id}`, { token: token ?? getStoredToken() }),
    create: (body: LivraisonGazRequest, token?: string | null) =>
      apiFetch<LivraisonGazResponse>("/api/livraisons-gaz", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: LivraisonGazRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<LivraisonGazResponse[]>(
        farmId != null ? `/api/livraisons-gaz/batch?farmId=${farmId}` : "/api/livraisons-gaz/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: LivraisonGazRequest, token?: string | null) =>
      apiFetch<LivraisonGazResponse>(`/api/livraisons-gaz/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/livraisons-gaz/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Vide sanitaire Gaz — one record per farm/lot */
  videSanitaireGaz: {
    get: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<VideSanitaireGazResponse | null>(
        qs ? `/api/vide-sanitaire-gaz?${qs}` : "/api/vide-sanitaire-gaz",
        { token: token ?? getStoredToken() }
      );
    },
    put: (body: VideSanitaireGazRequest, farmId?: number | null, token?: string | null) =>
      apiFetch<VideSanitaireGazResponse>(
        farmId != null ? `/api/vide-sanitaire-gaz?farmId=${farmId}` : "/api/vide-sanitaire-gaz",
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Main d'œuvre — optional farmId, lot for filtering */
  mainOeuvre: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<MainOeuvreResponse[]>(
        qs ? `/api/main-oeuvre?${qs}` : "/api/main-oeuvre",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<MainOeuvreResponse>(`/api/main-oeuvre/${id}`, { token: token ?? getStoredToken() }),
    create: (body: MainOeuvreRequest, token?: string | null) =>
      apiFetch<MainOeuvreResponse>("/api/main-oeuvre", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: MainOeuvreRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<MainOeuvreResponse[]>(
        farmId != null ? `/api/main-oeuvre/batch?farmId=${farmId}` : "/api/main-oeuvre/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: MainOeuvreRequest, token?: string | null) =>
      apiFetch<MainOeuvreResponse>(`/api/main-oeuvre/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/main-oeuvre/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Dépenses divers — optional farmId, lot for filtering */
  depensesDivers: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
      const qs = search.toString();
      return apiFetch<DepenseDiversResponse[]>(
        qs ? `/api/depenses-divers?${qs}` : "/api/depenses-divers",
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<DepenseDiversResponse>(`/api/depenses-divers/${id}`, { token: token ?? getStoredToken() }),
    create: (body: DepenseDiversRequest, token?: string | null) =>
      apiFetch<DepenseDiversResponse>("/api/depenses-divers", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: DepenseDiversRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<DepenseDiversResponse[]>(
        farmId != null ? `/api/depenses-divers/batch?farmId=${farmId}` : "/api/depenses-divers/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    update: (id: number, body: DepenseDiversRequest, token?: string | null) =>
      apiFetch<DepenseDiversResponse>(`/api/depenses-divers/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/depenses-divers/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Planning de Vaccination — RT/Admin only. List by farm and lot. */
  vaccinationPlanning: {
    list: (params: { farmId?: number | null; lot: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("lot", params.lot);
      if (params.farmId != null) search.set("farmId", String(params.farmId));
      return apiFetch<VaccinationPlanningResponse[]>(
        `/api/vaccination-planning?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    get: (id: number, token?: string | null) =>
      apiFetch<VaccinationPlanningResponse>(`/api/vaccination-planning/${id}`, { token: token ?? getStoredToken() }),
    create: (body: VaccinationPlanningRequest, token?: string | null) =>
      apiFetch<VaccinationPlanningResponse>("/api/vaccination-planning", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    createBatch: (body: VaccinationPlanningRequest[], farmId?: number | null, token?: string | null) =>
      apiFetch<VaccinationPlanningResponse[]>(
        farmId != null ? `/api/vaccination-planning/batch?farmId=${farmId}` : "/api/vaccination-planning/batch",
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    replace: (params: { lot: string; farmId?: number | null }, body: VaccinationPlanningRequest[], token?: string | null) => {
      const search = new URLSearchParams();
      search.set("lot", params.lot);
      if (params.farmId != null) search.set("farmId", String(params.farmId));
      return apiFetch<VaccinationPlanningResponse[]>(`/api/vaccination-planning/replace?${search.toString()}`, {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      });
    },
    update: (id: number, body: VaccinationPlanningRequest, token?: string | null) =>
      apiFetch<VaccinationPlanningResponse>(`/api/vaccination-planning/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/vaccination-planning/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Vaccination planning notes — list by farm+lot, replace all (RT/Admin only) */
  vaccinationPlanningNotes: {
    list: (params: { farmId?: number | null; lot: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("lot", params.lot);
      if (params.farmId != null) search.set("farmId", String(params.farmId));
      return apiFetch<VaccinationPlanningNoteResponse[]>(
        `/api/vaccination-planning-notes?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    replace: (
      params: { lot: string; farmId?: number | null },
      body: VaccinationPlanningNoteRequest[],
      token?: string | null
    ) => {
      const search = new URLSearchParams();
      search.set("lot", params.lot);
      if (params.farmId != null) search.set("farmId", String(params.farmId));
      return apiFetch<VaccinationPlanningNoteResponse[]>(
        `/api/vaccination-planning-notes/replace?${search.toString()}`,
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      );
    },
  },
  /** Vaccination reminder alerts — based on last day in last open lot, day before vaccine age. Count computed in backend. */
  vaccinationAlerts: {
    list: (params?: { farmId?: number | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      const qs = search.toString();
      return apiFetch<VaccinationAlertsResponse>(
        `/api/vaccination-alerts${qs ? `?${qs}` : ""}`,
        { token: token ?? getStoredToken() }
      );
    },
    sendEmail: (token?: string | null) =>
      apiFetch<void>("/api/vaccination-alerts/send-email", {
        method: "POST",
        token: token ?? getStoredToken(),
      }),
    confirm: (params: { farmId: number; lot: string; planningId: number }, token?: string | null) =>
      apiFetch<void>(
        `/api/vaccination-alerts/confirm?farmId=${params.farmId}&lot=${encodeURIComponent(params.lot)}&planningId=${params.planningId}`,
        { method: "POST", token: token ?? getStoredToken() }
      ),
    reschedule: (
      params: { farmId: number; lot: string; planningId: number; rescheduleDate: string },
      token?: string | null
    ) => {
      const qs = `farmId=${params.farmId}&lot=${encodeURIComponent(params.lot)}&planningId=${params.planningId}`;
      return apiFetch<void>(`/api/vaccination-alerts/reschedule?${qs}`, {
        method: "POST",
        body: JSON.stringify({ rescheduleDate: params.rescheduleDate }),
        token: token ?? getStoredToken(),
      });
    },
  },
  /** Liste des employés — global list, not scoped by farm */
  employers: {
    list: (token?: string | null) =>
      apiFetch<EmployerResponse[]>("/api/employers", {
        token: token ?? getStoredToken(),
      }),
    get: (id: number, token?: string | null) =>
      apiFetch<EmployerResponse>(`/api/employers/${id}`, { token: token ?? getStoredToken() }),
    create: (body: EmployerRequest, token?: string | null) =>
      apiFetch<EmployerResponse>("/api/employers", {
        method: "POST",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    update: (id: number, body: EmployerRequest, token?: string | null) =>
      apiFetch<EmployerResponse>(`/api/employers/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        token: token ?? getStoredToken(),
      }),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/employers/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
  },
  /** Suivi Technique Setup — initial configuration per lot/semaine/sex (each semaine isolated). */
  suiviTechniqueSetup: {
    list: (params: { farmId: number; lot: string; semaine: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      return apiFetch<SuiviTechniqueSetupResponse[]>(
        `/api/suivi-technique-setup?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    /** Get setup for (farm, lot, semaine, sex, batiment). Returns null when none exists. */
    getBySex: async (
      params: { farmId: number; lot: string; semaine: string; sex: string; batiment: string },
      token?: string | null
    ): Promise<SuiviTechniqueSetupResponse | null> => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      search.set("batiment", params.batiment);
      const t = token ?? getStoredToken();
      const url = `${getApiBase()}/api/suivi-technique-setup/by-sex?${search.toString()}`;
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", ...authHeader(null, t) },
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text();
        throw new Error(res.status === 401 ? "Unauthorized" : text || `HTTP ${res.status}`);
      }
      const text = await res.text();
      if (!text || text.trim() === "") return null;
      return JSON.parse(text) as SuiviTechniqueSetupResponse;
    },
    save: (body: SuiviTechniqueSetupRequest, farmId: number, token?: string | null) =>
      apiFetch<SuiviTechniqueSetupResponse>(
        `/api/suivi-technique-setup?farmId=${farmId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    delete: (params: { farmId: number; lot: string; semaine: string; sex: string; batiment: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      search.set("batiment", params.batiment);
      return apiFetch<void>(`/api/suivi-technique-setup?${search.toString()}`, { method: "DELETE", token: token ?? getStoredToken() });
    },
    /** Get list of sexes that have setup records for (farm, lot, batiment, semaine). */
    getConfiguredSexes: (params: { farmId: number; lot: string; batiment: string; semaine: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("batiment", params.batiment);
      search.set("semaine", params.semaine);
      return apiFetch<string[]>(
        `/api/suivi-technique-setup/sexes?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    /** Delete suivi data for a sex in the given batiment and semaine only (hebdo, production, consumption, performances, stock). */
    deleteAllDataForSex: (params: { farmId: number; lot: string; batiment: string; sex: string; semaine: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("batiment", params.batiment);
      search.set("sex", params.sex);
      search.set("semaine", params.semaine);
      return apiFetch<void>(`/api/suivi-technique-setup/all-data-for-sex?${search.toString()}`, {
        method: "DELETE",
        token: token ?? getStoredToken(),
      });
    },
  },
  /** Suivi Technique Hebdo — daily tracking data for weekly reports */
  suiviTechniqueHebdo: {
    list: (params: { farmId: number; lot?: string | null; sex?: string | null; batiment?: string | null; semaine?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      if (params.lot != null && params.lot !== "") search.set("lot", params.lot);
      if (params.sex != null && params.sex !== "") search.set("sex", params.sex);
      if (params.batiment != null && params.batiment !== "") search.set("batiment", params.batiment);
      if (params.semaine != null && params.semaine !== "") search.set("semaine", params.semaine);
      return apiFetch<SuiviTechniqueHebdoResponse[]>(
        `/api/suivi-technique-hebdo?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    saveBatch: (body: SuiviTechniqueHebdoRequest[], farmId: number, token?: string | null) =>
      apiFetch<SuiviTechniqueHebdoResponse[]>(
        `/api/suivi-technique-hebdo/batch?farmId=${farmId}`,
        {
          method: "POST",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    save: (body: SuiviTechniqueHebdoRequest, farmId: number, token?: string | null) =>
      apiFetch<SuiviTechniqueHebdoResponse>(
        `/api/suivi-technique-hebdo?farmId=${farmId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
    delete: (id: number, token?: string | null) =>
      apiFetch<void>(`/api/suivi-technique-hebdo/${id}`, { method: "DELETE", token: token ?? getStoredToken() }),
    getWeeklySummary: (params: { farmId: number; lot: string; sex: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("sex", params.sex);
      return apiFetch<WeeklySummary[]>(
        `/api/suivi-technique-hebdo/weekly-summary?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
  },
  /** Suivi de Production Hebdomadaire — REPORT (previous week total), VENTE, CONSO, AUTRE, TOTAL. Lot → Semaine → Batiment. */
  suiviProductionHebdo: {
    get: (params: { farmId: number; lot: string; semaine: string; sex: string; batiment?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      if (params.batiment != null && params.batiment !== "") search.set("batiment", params.batiment);
      return apiFetch<SuiviProductionHebdoResponse>(
        `/api/suivi-production-hebdo?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    save: (body: SuiviProductionHebdoRequest, farmId: number, token?: string | null) =>
      apiFetch<SuiviProductionHebdoResponse>(
        `/api/suivi-production-hebdo?farmId=${farmId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Suivi de Consommation Hebdomadaire — consommation and cumul are computed in backend from DB; get() returns those values for display. Lot → Semaine → Batiment. */
  suiviConsommationHebdo: {
    get: (params: { farmId: number; lot: string; semaine: string; sex: string; batiment?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      if (params.batiment != null && params.batiment !== "") search.set("batiment", params.batiment);
      return apiFetch<SuiviConsommationHebdoResponse>(
        `/api/suivi-consommation-hebdo?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    getResumeSummary: (params: { farmId: number; lot: string; semaine: string; batiments: string[] }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      if (params.batiments?.length) search.set("batiments", params.batiments.join(","));
      return apiFetch<ConsoResumeSummary>(
        `/api/suivi-consommation-hebdo/resume-summary?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    save: (body: SuiviConsommationHebdoRequest, farmId: number, token?: string | null) =>
      apiFetch<SuiviConsommationHebdoResponse>(
        `/api/suivi-consommation-hebdo?farmId=${farmId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Suivi de PERFORMANCES Hebdomadaire — REEL per lot/batiment, NORME shared per farm/semaine/sex. Écarts computed (reel - norme). */
  suiviPerformancesHebdo: {
    get: (params: { farmId: number; lot: string; semaine: string; sex: string; batiment?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      if (params.batiment != null && params.batiment !== "") search.set("batiment", params.batiment);
      return apiFetch<SuiviPerformancesHebdoResponse>(
        `/api/suivi-performances-hebdo?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    /** Save REEL values only. NORME is managed separately via performanceNorme.save(). */
    save: (body: SuiviPerformancesHebdoRequest, farmId: number, token?: string | null) =>
      apiFetch<SuiviPerformancesHebdoResponse>(
        `/api/suivi-performances-hebdo?farmId=${farmId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Performance NORME — shared reference values per (farm, semaine, sex). Applies to ALL lots and batiments. */
  performanceNorme: {
    get: (params: { farmId: number; semaine: string; sex: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      return apiFetch<PerformanceNormeResponse>(
        `/api/performance-norme?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    /** Save NORME values. Only ADMINISTRATEUR and RESPONSABLE_TECHNIQUE can do this. */
    save: (body: PerformanceNormeRequest, farmId: number, token?: string | null) =>
      apiFetch<PerformanceNormeResponse>(
        `/api/performance-norme?farmId=${farmId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
          token: token ?? getStoredToken(),
        }
      ),
  },
  /** Suivi de Stock — effectif restant, poids vif produit (kg), stock aliment (user-entered when batiment set) */
  suiviStock: {
    get: (params: { farmId?: number | null; lot: string; semaine: string; sex: string; batiment?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params.farmId != null) search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      search.set("sex", params.sex);
      if (params.batiment != null && params.batiment.trim() !== "") search.set("batiment", params.batiment);
      return apiFetch<SuiviStockResponse>(
        `/api/suivi-stock?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    saveStockAliment: (
      params: { farmId?: number | null; lot: string; semaine: string; sex: string; batiment?: string | null },
      body: SaveStockAlimentRequest,
      token?: string | null
    ) => {
      const search = new URLSearchParams();
      if (params.farmId != null) search.set("farmId", String(params.farmId));
      return apiFetch<SuiviStockResponse>(
        `/api/suivi-stock/stock-aliment?${search.toString()}`,
        { method: "PUT", body: JSON.stringify(body), token: token ?? getStoredToken() }
      );
    },
  },
  /** Suivi Coût Hebdomadaire — Prix de revient (e.g. AMORTISSEMENT). List: all; save: responsable technique only. */
  suiviCoutHebdo: {
    list: (params: { farmId: number; lot: string; semaine: string }, token?: string | null) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      return apiFetch<SuiviCoutHebdoResponse[]>(
        `/api/suivi-cout-hebdo?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    getResumeSummary: (
      params: { farmId: number; lot: string; semaine: string; batiments?: string },
      token?: string | null
    ) => {
      const search = new URLSearchParams();
      search.set("farmId", String(params.farmId));
      search.set("lot", params.lot);
      search.set("semaine", params.semaine);
      if (params.batiments?.trim()) search.set("batiments", params.batiments.trim());
      return apiFetch<ResumeCoutsHebdoSummaryResponse>(
        `/api/suivi-cout-hebdo/resume-summary?${search.toString()}`,
        { token: token ?? getStoredToken() }
      );
    },
    save: (
      body: SuiviCoutHebdoRequest,
      params: { farmId: number; lot: string; semaine: string },
      token?: string | null
    ) =>
      apiFetch<SuiviCoutHebdoResponse>(
        `/api/suivi-cout-hebdo?farmId=${params.farmId}&lot=${encodeURIComponent(params.lot)}&semaine=${encodeURIComponent(params.semaine)}`,
        {
          method: "PUT",
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

/** Lot with closed/open status. Closed lots are grey and inaccessible to non-RT/Admin. */
export interface LotWithStatusResponse {
  lot: string;
  closed: boolean;
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

/** Setup information — extended placement data with additional fields for reuse across weeks */
export interface SetupInfoRequest {
  lot: string;
  dateMiseEnPlace: string;
  heureMiseEnPlace: string;
  building: string;
  sex: string;
  effectifMisEnPlace: number;
  typeElevage: string;
  origineFournisseur: string;
  dateEclosion: string;
  souche: string;
}

export interface SetupInfoResponse extends SetupInfoRequest {
  id: number;
  farmId: number;
  createdAt: string;
}

/** Reporting journalier — request (farm is set from JWT on backend) */
export interface DailyReportRequest {
  reportDate: string;
  ageJour?: number | null;
  semaine?: number | null;
  lot?: string | null;
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
  lot?: string | null;
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

/** Livraisons Aliment — request (farm from JWT or optional farmId for Admin/RT) */
export interface LivraisonAlimentRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: number | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBonReception?: string | null;
  qte?: number | null;
  sex?: string | null;
  maleQty?: number | null;
  femaleQty?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  kgPerBag?: number | null;
  kgConsumed?: number | null;
  stockBeforeKg?: number | null;
  movementType?: string | null;
  notes?: string | null;
}

export interface LivraisonAlimentResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: number | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBonReception?: string | null;
  qte?: number | null;
  sex?: string | null;
  maleQty?: number | null;
  femaleQty?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  kgPerBag?: number | null;
  kgReceived?: number | null;
  kgConsumed?: number | null;
  stockBeforeKg?: number | null;
  stockAfterKg?: number | null;
  movementType?: string | null;
  notes?: string | null;
  createdBy?: number | null;
  verifiedBy?: number | null;
  verifiedAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Livraisons Produits Vétérinaires — request (farm from JWT or optional farmId for Admin/RT) */
export interface LivraisonProduitVeterinaireRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  ug?: string | null;
  deliveryNoteNumber?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
}

export interface LivraisonProduitVeterinaireResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  ug?: string | null;
  deliveryNoteNumber?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Livraisons Produits Hygiène — request (farm from JWT or optional farmId for Admin/RT) */
export interface LivraisonProduitHygieneRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  numeroBR?: string | null;
  male?: number | null;
  femelle?: number | null;
}

export interface LivraisonProduitHygieneResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  numeroBR?: string | null;
  male?: number | null;
  femelle?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Vide sanitaire (Produits Hygiène) — only qte, prixPerUnit; montant calculated server-side */
export interface VideSanitaireRequest {
  farmId?: number | null;
  lot?: string | null;
  date?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
}

export interface VideSanitaireResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
}

/** Livraisons Paille — request */
export interface LivraisonPailleRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
}

export interface LivraisonPailleResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Vide sanitaire Paille — one record per farm/lot */
export interface VideSanitairePailleRequest {
  farmId?: number | null;
  lot?: string | null;
  date?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
}

export interface VideSanitairePailleResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
}

/** Livraisons Électricité — request (farm from JWT or optional farmId for Admin/RT) */
export interface LivraisonElectriciteRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: string | number | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  numeroBR?: string | null;
  male?: number | null;
  femelle?: number | null;
}

export interface LivraisonElectriciteResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  numeroBR?: string | null;
  male?: number | null;
  femelle?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Livraisons Gaz — request (farm from JWT or optional farmId for Admin/RT) */
export interface LivraisonGazRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  numeroBR?: string | null;
  male?: number | null;
  femelle?: number | null;
}

export interface LivraisonGazResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  numeroBR?: string | null;
  male?: number | null;
  femelle?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Vide sanitaire Gaz — one record per farm/lot */
export interface VideSanitaireGazRequest {
  farmId?: number | null;
  lot?: string | null;
  date?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
}

export interface VideSanitaireGazResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
}

/** Main d'œuvre — request (farm from JWT or optional farmId for Admin/RT) */
export interface MainOeuvreRequest {
  farmId?: number | null;
  employerId?: number | null;
  /** true = 1 jour, false = 1/2 demijour */
  fullDay?: boolean | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  nbMo?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  observation?: string | null;
}

export interface MainOeuvreResponse {
  id: number;
  farmId: number;
  employerId?: number | null;
  employerNom?: string | null;
  employerPrenom?: string | null;
  /** true = 1 jour, false = 1/2 demijour */
  fullDay?: boolean | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  sem?: string | null;
  nbMo?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  observation?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Dépenses divers — request (farm from JWT or optional farmId for Admin/RT) */
export interface DepenseDiversRequest {
  farmId?: number | null;
  lot?: string | null;
  date: string;
  age?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  ug?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
}

export interface DepenseDiversResponse {
  id: number;
  farmId: number;
  lot?: string | null;
  date: string;
  age?: string | null;
  designation?: string | null;
  supplier?: string | null;
  deliveryNoteNumber?: string | null;
  numeroBR?: string | null;
  ug?: string | null;
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Planning de Vaccination — request (RT/Admin only) */
export interface VaccinationPlanningRequest {
  farmId?: number | null;
  lot: string;
  ordre: number;
  age: string;
  planDate?: string | null;
  motif?: string | null;
  vaccinTraitement?: string | null;
  quantite?: string | null;
  administration?: string | null;
  remarques?: string | null;
}

export interface VaccinationPlanningResponse {
  id: number;
  farmId: number;
  lot: string;
  ordre: number;
  age: string;
  planDate?: string | null;
  motif?: string | null;
  vaccinTraitement?: string | null;
  quantite?: string | null;
  administration?: string | null;
  remarques?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Vaccination planning notes — request (replace list) */
export interface VaccinationPlanningNoteRequest {
  farmId?: number | null;
  lot: string;
  ordre: number;
  label: string;
  content?: string | null;
  selected: boolean;
}

export interface VaccinationPlanningNoteResponse {
  id: number;
  farmId: number;
  lot: string;
  ordre: number;
  label: string;
  content?: string | null;
  selected: boolean;
}

/** Vaccination alerts API response — count computed in backend (single source of truth) */
export interface VaccinationAlertsResponse {
  count: number;
  alerts: VaccinationAlertResponse[];
}

/** Vaccination reminder alert — triggered day before vaccine age matches */
export interface VaccinationAlertResponse {
  planningId: number;
  farmId: number;
  farmName: string;
  lot: string;
  currentAge: number;
  vaccineAgeDays: number;
  vaccineAgeLabel: string;
  vaccinTraitement?: string | null;
  planDate?: string | null;
  motif?: string | null;
  quantite?: string | null;
  administration?: string | null;
  remarques?: string | null;
  lastReportDate: string;
  notes?: string[] | null;
  /** True when alert came from a reschedule (reappeared on chosen date) */
  rescheduled?: boolean;
}

/** Liste des employés — request (global list, not tied to farm) */
export interface EmployerRequest {
  nom: string;
  prenom: string;
  numeroEmploye?: string | null;
  salaire?: number | null;
}

export interface EmployerResponse {
  id: number;
  nom: string;
  prenom: string;
  numeroEmploye?: string | null;
  salaire?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Suivi Technique Setup — request (initial configuration per lot/semaine/sex) */
export interface SuiviTechniqueSetupRequest {
  farmId?: number | null;
  lot: string;
  semaine: string;
  sex: string;
  typeElevage?: string | null;
  origineFournisseur?: string | null;
  dateEclosion?: string | null;
  heureMiseEnPlace?: string | null;
  dateMiseEnPlace?: string | null;
  souche?: string | null;
  effectifMisEnPlace?: number | null;
  batiment?: string | null;
}

export interface SuiviTechniqueSetupResponse {
  id: number;
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  typeElevage?: string | null;
  origineFournisseur?: string | null;
  dateEclosion?: string | null;
  heureMiseEnPlace?: string | null;
  dateMiseEnPlace?: string | null;
  souche?: string | null;
  effectifMisEnPlace?: number | null;
  batiment?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Suivi Technique Hebdo — request (daily tracking data for weekly reports) */
export interface SuiviTechniqueHebdoRequest {
  farmId?: number | null;
  lot: string;
  sex: string;
  batiment?: string | null;
  semaine?: string | null;
  effectifDepart?: number | null;
  recordDate: string;
  ageJour?: number | null;
  mortaliteNbre?: number | null;
  consoEauL?: number | null;
  tempMin?: number | null;
  tempMax?: number | null;
  vaccination?: string | null;
  traitement?: string | null;
  observation?: string | null;
}

export interface SuiviTechniqueHebdoResponse {
  id: number;
  farmId: number;
  lot: string;
  sex: string;
  batiment?: string | null;
  semaine?: string | null;
  effectifDepart?: number | null;
  recordDate: string;
  ageJour?: number | null;
  mortaliteNbre?: number | null;
  mortalitePct?: number | null;
  mortaliteCumul?: number | null;
  mortaliteCumulPct?: number | null;
  consoEauL?: number | null;
  tempMin?: number | null;
  tempMax?: number | null;
  vaccination?: string | null;
  traitement?: string | null;
  observation?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  /** True when ageJour, mortaliteNbre, consoEauL are all null — placeholder rows stay editable */
  isPlaceholder?: boolean;
}

/** Weekly summary for Suivi Technique */
export interface WeeklySummary {
  semaine: string;
  totalMortality: number;
  totalWater: number;
}

/** Suivi de Production Hebdo — request (vente, conso, autre only; report set by backend) */
export interface SuiviProductionHebdoRequest {
  farmId?: number | null;
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  venteNbre?: number | null;
  ventePoids?: number | null;
  consoNbre?: number | null;
  consoPoids?: number | null;
  autreNbre?: number | null;
  autrePoids?: number | null;
}

/** Suivi de Production Hebdo — response (report = previous week total, total = computed) */
export interface SuiviProductionHebdoResponse {
  id?: number;
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  reportNbre?: number | null;
  reportPoids?: number | null;
  venteNbre?: number | null;
  ventePoids?: number | null;
  consoNbre?: number | null;
  consoPoids?: number | null;
  autreNbre?: number | null;
  autrePoids?: number | null;
  totalNbre?: number | null;
  totalPoids?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Suivi de Consommation Hebdo — request (consommation aliment semaine only) */
export interface SuiviConsommationHebdoRequest {
  farmId?: number | null;
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  consommationAlimentKg?: number | null;
}

/** Suivi de Consommation Hebdo — response. All values are computed in the backend from DB (stock + livraisons). Frontend must only read; never calculate consommation or cumul on the client. */
export interface SuiviConsommationHebdoResponse {
  id?: number;
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  /** Backend-computed (Stock_prev + Livraisons - Stock_current). Read-only. */
  consommationAlimentSemaine?: number | null;
  /** Backend-computed week-only cumul. Read-only. */
  cumulAlimentConsomme?: number | null;
  totalEauSemaineL?: number | null;
  indiceEauAliment?: number | null;
  consoAlimentKgParJour?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Resume page consumption summary — CONSOMME ALIMENT and CUMUL computed in backend from DB; frontend reads only. Per-sex = sum across B1+B2+B3+... */
export interface ConsoResumeSummary {
  consoAlimentSemaineSum?: number | null;
  cumulAlimentConsommeSum?: number | null;
  consoAlimentSemaineMale?: number | null;
  consoAlimentSemaineFemelle?: number | null;
  cumulAlimentConsommeMale?: number | null;
  cumulAlimentConsommeFemelle?: number | null;
}

/** Suivi de PERFORMANCES Hebdo — request (REEL + NORME; NORME applied only if user has update permission) */
export interface SuiviPerformancesHebdoRequest {
  farmId?: number | null;
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  poidsMoyenReel?: number | null;
  homogeneiteReel?: number | null;
  indiceConsommationReel?: number | null;
  gmqReel?: number | null;
  viabiliteReel?: number | null;
  poidsMoyenNorme?: number | null;
  homogeneiteNorme?: number | null;
  indiceConsommationNorme?: number | null;
  gmqNorme?: number | null;
  viabiliteNorme?: number | null;
}

/** Suivi de PERFORMANCES Hebdo — response (Écarts computed: reel - norme) */
export interface SuiviPerformancesHebdoResponse {
  id?: number;
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  poidsMoyenReel?: number | null;
  homogeneiteReel?: number | null;
  indiceConsommationReel?: number | null;
  gmqReel?: number | null;
  viabiliteReel?: number | null;
  poidsMoyenNorme?: number | null;
  homogeneiteNorme?: number | null;
  indiceConsommationNorme?: number | null;
  gmqNorme?: number | null;
  viabiliteNorme?: number | null;
  poidsMoyenEcart?: number | null;
  homogeneiteEcart?: number | null;
  indiceConsommationEcart?: number | null;
  gmqEcart?: number | null;
  viabiliteEcart?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Suivi de Stock — effectif restant, poids vif produit kg, stock aliment (user-entered when batiment set) */
export interface SuiviStockResponse {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Batiment (optional). When provided, stock is batiment-specific; otherwise aggregated across all batiments. */
  batiment?: string | null;
  effectifRestantFinSemaine?: number | null;
  poidsVifProduitKg?: number | null;
  stockAliment?: number | null;
  /** When batiment is set: true if a stock record already exists (saved). Used to enforce RESPONSABLE_FERME create-only: can save once, cannot modify after. */
  stockAlimentRecordExists?: boolean | null;
}

/** Request to save user-entered stock aliment. Consumption: B1 = Stock_prev + Livraisons - Stock; B2+ = Stock_transfer - Stock. */
export interface SaveStockAlimentRequest {
  lot: string;
  semaine: string;
  sex: string;
  batiment?: string | null;
  stockAlimentKg?: number | null;
}

/** Suivi Coût Hebdo — one cost line (e.g. AMORTISSEMENT) for Prix de revient. */
export interface ResumeCoutsHebdoSummaryResponse {
  costLines: SuiviCoutHebdoResponse[];
  computedRows: { designation: string; valeurS1: number; cumul: number }[];
  poidsVifProduitKg: number | null;
  totalCumul: number;
  effectifRestantFinSemaine: number;
  totalNbreProduction: number;
  prixRevientParSujet: number | null;
  prixRevientParKg: number | null;
}

export interface SuiviCoutHebdoResponse {
  id: number;
  farmId: number;
  lot: string;
  semaine: string;
  designation: string;
  valeurS1?: number | null;
  cumul?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SuiviCoutHebdoRequest {
  designation: string;
  valeurS1?: number | null;
  cumul?: number | null;
}

/** Performance NORME — request (shared norms per farm/semaine/sex). Only ADMINISTRATEUR/RESPONSABLE_TECHNIQUE can save. */
export interface PerformanceNormeRequest {
  semaine: string;
  sex: string;
  poidsMoyenNorme?: number | null;
  homogeneiteNorme?: number | null;
  indiceConsommationNorme?: number | null;
  gmqNorme?: number | null;
  viabiliteNorme?: number | null;
}

/** Performance NORME — response (shared norms per farm/semaine/sex). All users can read. */
export interface PerformanceNormeResponse {
  id?: number;
  farmId: number;
  semaine: string;
  sex: string;
  poidsMoyenNorme?: number | null;
  homogeneiteNorme?: number | null;
  indiceConsommationNorme?: number | null;
  gmqNorme?: number | null;
  viabiliteNorme?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Effectif initial (Effectif Mis en Place) per building and sex for the lot */
export interface DailyEffectifInitialEntry {
  building: string;
  sex: string;
  effectifInitial: number;
}

/** Daily Dashboard Summary — aggregated metrics from the latest day's report */
export interface DailyDashboardSummary {
  reportDate: string;
  ageJour?: number | null;
  semaine?: number | null;
  lot: string;
  sexMetrics: DailySexMetrics[];
  totalMortality: number;
  /** Effectif initial per bâtiment/sex (same as Effectif Mis en Place in Reporting Journalier) */
  effectifInitialByBuildingSex?: DailyEffectifInitialEntry[];
}

export interface DailySexMetrics {
  sex: string;
  mortalityCount: number;
  waterConsumption: number;
  tempMin?: number | null;
  tempMax?: number | null;
  traitement?: string | null;
}
