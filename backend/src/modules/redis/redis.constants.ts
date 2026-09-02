export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const OTP_TTL_SECONDS = 900; // 15 minutes, per spec 01-auth
export const RESET_TOKEN_TTL_SECONDS = 3600; // 1 hour, per spec 01-auth
export const OTP_RESEND_COOLDOWN_SECONDS = 60; // per spec 01-auth

export const SUNAT_CACHE_TTL_SECONDS = 86400; // 24 hours, per plan.md (Feature 02)
// Long enough that a user who abandons the wizard on Friday still finds their
// progress on Monday (spec §1, "Persistencia del Estado").
export const ONBOARDING_DRAFT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Feature 09 — Google Calendar Jerárquico. Google's OAuth redirect back to
// GET /integrations/google/callback is a plain top-level browser navigation:
// it carries neither the x-tenant-id header nor an Authorization header, so
// TenantContextInterceptor cannot resolve a tenant on that route. The `state`
// param round-trips a random key that maps back to the tenant that started
// the flow — 10 minutes is generous for "click connect, approve on Google's
// consent screen" while still expiring an abandoned attempt.
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes
