import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

// Talks to backend/ (NestJS). Separate from the Supabase-backed routes
// used by the rest of this app (src/lib/supabase/*) — see
// .specify/features/01-auth for the auth flow this powers.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  withCredentials: true,
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

/**
 * Active centro estético, sent as `x-tenant-id` on every request.
 *
 * The backend's TenantContextInterceptor resolves this header against the
 * caller's TenantUser rows and only then lets a handler read or write anything
 * scoped to a tenant — routes using @TenantId() answer 403 without it. It is
 * NOT a trust boundary: the server verifies membership, so the worst a tampered
 * value can do is get a 403.
 *
 * Kept in a module-level variable rather than passed per call because every
 * feature module would otherwise have to remember to attach it, and forgetting
 * produces a 403 that looks like a permissions bug rather than a missing
 * header. AuthProvider sets it as soon as the membership lookup settles.
 */
let activeTenantId: string | null = null;

export function setActiveTenantId(tenantId: string | null): void {
  activeTenantId = tenantId;
}

export function getActiveTenantId(): string | null {
  return activeTenantId;
}

api.interceptors.request.use((config) => {
  if (activeTenantId) {
    config.headers.set("x-tenant-id", activeTenantId);
  }
  return config;
});

// Coalesces concurrent 401s into a single refresh call instead of firing
// one refresh request per failed request.
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = api
      .post("/auth/refresh")
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const isRefreshCall = originalRequest?.url?.includes("/auth/refresh");

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isRefreshCall
    ) {
      originalRequest._retry = true;
      try {
        await refreshSession();
        return api(originalRequest);
      } catch {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message[0] ?? fallback;
    if (typeof data?.message === "string") return data.message;
  }
  return fallback;
}
