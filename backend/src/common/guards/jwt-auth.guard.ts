import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload, AuthenticatedRequest } from '../types/authenticated-request';

const SESSION_REQUIRED_MESSAGE = 'Sesión expirada. Inicia sesión nuevamente.';

/**
 * Verifies the short-lived access token and puts the caller on `req.user`.
 *
 * Feature 01 issues the access token as an httpOnly cookie (`access_token`)
 * and never shipped a guard to consume it — every protected route added from
 * Feature 02 onwards needs one, so it lives in common/ rather than inside
 * TenantModule.
 *
 * The Authorization header is accepted as a secondary source so non-browser
 * clients (the future WhatsApp bot, integration tests) don't need a cookie jar.
 *
 * Unlike the frontend middleware — which does a presence-only cookie check to
 * decide redirects — this one actually verifies the signature, the expiry and
 * the token `type`, because it is what grants access to tenant data.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }

    // A refresh token is signed with the same secret, so without this check it
    // would authenticate requests for its full 7-day lifetime.
    if (payload.type !== 'access') {
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const cookieToken = request.cookies?.access_token as string | undefined;
    if (cookieToken) {
      return cookieToken;
    }

    const [scheme, headerToken] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? headerToken : undefined;
  }
}
