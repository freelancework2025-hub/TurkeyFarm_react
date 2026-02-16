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
    /** List distinct lot numbers for a farm (from placements). Used for lot selector boxes. */
    lots: (farmId: number, token?: string | null) =>
      apiFetch<string[]>(`/api/farms/${farmId}/lots`, { token: token ?? getStoredToken() }),
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
  /** Sorties Ferme — optional farmId and lot for filtering */
  sorties: {
    list: (params?: { farmId?: number | null; lot?: string | null }, token?: string | null) => {
      const search = new URLSearchParams();
      if (params?.farmId != null) search.set("farmId", String(params.farmId));
      if (params?.lot != null && params.lot !== "") search.set("lot", params.lot);
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
  qte?: number | null;
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
  qte?: number | null;
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
  age?: string | null;
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
  qte?: number | null;
  prixPerUnit?: number | null;
  montant?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Liste des employés — request (global list, not tied to farm) */
export interface EmployerRequest {
  nom: string;
  prenom: string;
  salaire?: number | null;
}

export interface EmployerResponse {
  id: number;
  nom: string;
  prenom: string;
  salaire?: number | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}
