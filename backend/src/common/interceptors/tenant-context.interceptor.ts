import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../modules/prisma/prisma.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';

export const TENANT_HEADER = 'x-tenant-id';
export const TENANT_COOKIE = 'active_tenant_id';

/**
 * Resolves the multi-tenant context of a request (Task 2.4, spec §4 criterion 4).
 *
 * Registered globally in AppModule, so every route — present and future —
 * gets the same treatment:
 *
 *   - No `x-tenant-id` header / `active_tenant_id` cookie: nothing to resolve,
 *     `req.tenantId` stays undefined and the request continues. Routes that
 *     legitimately run without a tenant (login, register, POST /tenant/onboarding
 *     — the tenant does not exist yet at that point) keep working.
 *   - Tenant claimed but no authenticated caller: rejected. An anonymous
 *     request must never establish a tenant context.
 *   - Tenant claimed by a caller with no TenantUser row for it: rejected with
 *     404-ish semantics deliberately avoided — a 403 with a generic message so
 *     the header can't be used to probe which tenant ids exist.
 *
 * The key property: `req.tenantId` is only ever set AFTER membership was
 * verified against the database. Downstream code reading it via @TenantId()
 * never has to re-check.
 *
 * Interceptors run after guards, so JwtAuthGuard has already populated
 * `req.user` by the time this runs on a protected route.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claimedTenantId = this.extractTenantId(request);

    if (!claimedTenantId) {
      return next.handle();
    }

    if (!request.user) {
      throw new UnauthorizedException('Sesión expirada. Inicia sesión nuevamente.');
    }

    const membership = await this.prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId: claimedTenantId, userId: request.user.id },
      },
      select: { tenantId: true },
    });

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este centro estético.');
    }

    request.tenantId = membership.tenantId;
    return next.handle();
  }

  private extractTenantId(request: AuthenticatedRequest): string | undefined {
    const header = request.headers[TENANT_HEADER];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    const fromCookie = request.cookies?.[TENANT_COOKIE] as string | undefined;
    return (fromHeader ?? fromCookie)?.trim() || undefined;
  }
}
