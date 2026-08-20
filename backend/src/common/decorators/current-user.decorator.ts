import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, RequestUser } from '../types/authenticated-request';

/**
 * Injects the caller resolved by JwtAuthGuard.
 *
 *   @CurrentUser() user: RequestUser   -> the whole object
 *   @CurrentUser('id') userId: string  -> a single claim
 *
 * Throws rather than returning undefined when the route forgot
 * `@UseGuards(JwtAuthGuard)`: a silent `undefined` userId would otherwise
 * reach Prisma and turn a missing guard into corrupt rows.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException('Sesión expirada. Inicia sesión nuevamente.');
    }
    return field ? request.user[field] : request.user;
  },
);
