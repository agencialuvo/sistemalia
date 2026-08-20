"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setActiveTenantId } from "@/lib/api";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  type AccountRole,
} from "@/lib/auth/roles";

/**
 * Session context for the dashboard, backed by the NestJS API.
 *
 * Previously this read the Supabase browser client directly, which made every
 * dashboard route crash with "Your project's URL and API key are required" on a
 * deployment that has no Supabase credentials — the normal case for Sistema
 * LIA, whose auth lives in backend/ (Feature 01) and whose tenants live in
 * Prisma (Feature 02).
 *
 * The exported shape is deliberately unchanged: 37 components consume this
 * context, and the wacrm vocabulary ("account", "profile", account roles) is
 * mapped onto the LIA one (tenant, TenantRole) rather than renamed, so this
 * stayed a contained swap instead of a 37-file refactor.
 */

/** The signed-in account, as GET /auth/me returns it. */
interface SessionUser {
  id: string;
  email: string;
  /** Kept snake_case: consumers read `user.created_at` (inherited wacrm shape). */
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
  /** Always empty here — beta gating was a Supabase-only concept. */
  beta_features: string[];
  /** The active tenant id. Named account_id to match existing consumers. */
  account_id: string | null;
  account_role: AccountRole | null;
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  profile: Profile | null;
  /** Session-level loading: false once we know whether someone is signed in. */
  loading: boolean;
  /** Tenant-level loading: false once the membership lookup settles. */
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  status: string;
  createdAt: string;
}

interface TenantMembership {
  id: string;
  commercialName: string;
  legalName: string;
  specialty: string;
  logoUrl: string | null;
  onboardingCompletedAt: string | null;
  role: "ADMIN_OWNER" | "ADMIN" | "MEMBER";
}

/**
 * Maps a Prisma TenantRole onto the wacrm AccountRole the UI gates on.
 *
 * MEMBER lands on "agent" rather than "viewer" because a MEMBER is staff who
 * books appointments and messages patients — read-only would be the wrong
 * default. Feature 02 defines no viewer-equivalent yet.
 */
function toAccountRole(role: TenantMembership["role"] | undefined): AccountRole | null {
  switch (role) {
    case "ADMIN_OWNER":
      return "owner";
    case "ADMIN":
      return "admin";
    case "MEMBER":
      return "agent";
    default:
      return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  /**
   * Resolves the tenant the user belongs to. Separate from the session call so
   * the chrome (sidebar/header) can render from the user alone while this is
   * still in flight — the same two-phase contract the Supabase version had.
   */
  const fetchTenant = useCallback(async (me: MeResponse) => {
    setProfileLoading(true);
    try {
      const { data } = await api.get<TenantMembership[]>("/tenant/me");
      // The wizard only ever creates one tenant per account today; if that
      // changes, this is where a tenant switcher would pick the active one.
      const membership = data?.[0] ?? null;

      // Publishes the tenant to the axios interceptor BEFORE any feature
      // module fires its first request. Without this every /services call
      // (and every future tenant-scoped module) answers 403.
      setActiveTenantId(membership?.id ?? null);

      setProfile({
        id: me.id,
        full_name: me.fullName,
        email: me.email,
        avatar_url: membership?.logoUrl ?? null,
        role: membership?.role ?? null,
        beta_features: [],
        account_id: membership?.id ?? null,
        account_role: toAccountRole(membership?.role),
      });

      setAccount(
        membership
          ? {
              id: membership.id,
              name: membership.commercialName,
              // No per-tenant currency column yet (Feature 02 models identity,
              // location and hours only). Every centro is Peruvian for now.
              default_currency: DEFAULT_CURRENCY,
            }
          : null,
      );
    } catch (err) {
      // A failed tenant lookup must not blank the session — the user is still
      // signed in, they just have no tenant context (e.g. mid-onboarding).
      console.error("[AuthProvider] /tenant/me failed:", err);
      setActiveTenantId(null);
      setProfile({
        id: me.id,
        full_name: me.fullName,
        email: me.email,
        avatar_url: null,
        role: null,
        beta_features: [],
        account_id: null,
        account_role: null,
      });
      setAccount(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: me } = await api.get<MeResponse>("/auth/me");
        if (!mounted) return;

        setUser({ id: me.id, email: me.email, created_at: me.createdAt });
        // Intentionally not awaited: chrome renders from the user object while
        // the tenant resolves.
        void fetchTenant(me);
      } catch {
        // 401 (no/expired session) or the API is unreachable. Either way there
        // is no user; DashboardShellInner redirects to /login.
        if (!mounted) return;
        setUser(null);
        setProfileLoading(false);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [fetchTenant]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // No logout route yet (Feature 01 ships none). Clearing local state and
      // navigating away is the best available behaviour; the access token
      // expires in 15 minutes regardless.
    }
    setUser(null);
    setProfile(null);
    setAccount(null);
    setActiveTenantId(null);
    window.location.href = "/login";
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchTenant({
      id: user.id,
      email: user.email,
      fullName: profile?.full_name ?? "",
      status: "ACTIVE",
      createdAt: user.created_at,
    });
  }, [user, profile?.full_name, fetchTenant]);

  const derived = useMemo(() => {
    const role = profile?.account_role ?? null;
    return {
      accountRole: role,
      accountId: profile?.account_id ?? null,
      isOwner: role === "owner",
      isAdmin: role === "admin",
      isAgent: role === "agent",
      isViewer: role === "viewer",
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [profile?.account_role, profile?.account_id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        profileLoading,
        signOut,
        refreshProfile,
        account,
        defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
        ...derived,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — read the shared auth state from context.
 * Must be used inside an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (shouldn't happen
    // in normal flow, but don't crash the page). Account state collapses to
    // least-privileged null so every `canX` gate fails closed.
    return {
      user: null,
      profile: null,
      loading: false,
      profileLoading: false,
      signOut: async () => {
        window.location.href = "/login";
      },
      refreshProfile: async () => {},
      account: null,
      defaultCurrency: DEFAULT_CURRENCY,
      accountId: null,
      accountRole: null,
      isOwner: false,
      isAdmin: false,
      isAgent: false,
      isViewer: false,
      canManageMembers: false,
      canEditSettings: false,
      canSendMessages: false,
    };
  }
  return ctx;
}
