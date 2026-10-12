// a API fica em outra origem (api.prevsion.com); no dev, VITE_API_URL vazio e o proxy do vite repassa /api
const API = `${import.meta.env.VITE_API_URL ?? ""}/api`;
const TOKEN = "joggpix_admin_token";
const USER = "joggpix_admin_user";

// papel: "admin" vê o painel inteiro; "influencer" só o próprio dashboard (/influencer)
export type AdminUser = { nome: string; email: string; avatarUrl?: string | null; papel?: "admin" | "influencer" };

export const session = {
  token: () => localStorage.getItem(TOKEN),
  user: (): AdminUser | null => {
    try { return JSON.parse(localStorage.getItem(USER) || "null"); } catch { return null; }
  },
  save(token: string, user: AdminUser) {
    localStorage.setItem(TOKEN, token);
    localStorage.setItem(USER, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** só GET e POST (o CORS da API não libera outros métodos). Com body vira POST. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
    });
  } catch {
    throw new ApiError("Sem conexão com o servidor. Tente de novo.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    session.clear();
    location.hash = "#/login";
  }
  if (!res.ok) throw new ApiError(body?.error || `Erro ${res.status}`, res.status);
  return body as T;
}

/** atalho pros POST com JSON */
export const post = <T = { ok: boolean }>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

/** encerra a sessão no servidor (sem esperar) e limpa a local */
export function sair() {
  if (session.token()) post("/logout").catch(() => {});
  session.clear();
}

/** query string sem os campos vazios */
export const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};
