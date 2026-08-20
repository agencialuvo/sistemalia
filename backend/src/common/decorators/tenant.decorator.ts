import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Injects the tenant id that TenantContextInterceptor already validated the
 * caller belongs to (Task 2.4).
 *
 *   findAll(@TenantId() tenantId: string) { ... }
 *
 * Required by design: a handler asking for a tenant id cannot run without one,
 * so a missing `x-tenant-id` raises 403 instead of leaking an `undefined` into
 * a Prisma `where` clause — which in Prisma would silently drop the filter and
 * return rows across every tenant. That is exactly the failure this whole
 * mechanism exists to prevent, so it must not be reachable by omission.
 */
export const TenantId = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.tenantId) {
    throw new ForbiddenException(
      'Falta el contexto del centro estético (encabezado x-tenant-id).',
    );
  }
  return request.tenantId;
});
