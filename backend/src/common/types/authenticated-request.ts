import type { Request } from 'express';

/** Claims carried by the `access_token` cookie minted in AuthService.issueTokens(). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

/** The caller, as resolved by JwtAuthGuard from the access token. */
export interface RequestUser {
  id: string;
  email: string;
}

/**
 * Express request enriched by the auth/tenant pipeline:
 *   - `user`     — set by JwtAuthGuard (guards run first).
 *   - `tenantId` — set by TenantContextInterceptor, only after the caller's
 *                  membership in that tenant has been verified against
 *                  TenantUser. Undefined means "no tenant context on this
 *                  request", never "unverified tenant".
 */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
  tenantId?: string;
}
