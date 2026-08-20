import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { OnboardingResult, TenantService } from './tenant.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * POST /tenant/onboarding — "Finalizar y Configurar Mi Centro" (Paso 3).
   *
   * Note this route does NOT require an x-tenant-id: it is the request that
   * creates the tenant, so the caller has no tenant context yet.
   */
  @Post('onboarding')
  @HttpCode(HttpStatus.CREATED)
  createTenant(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTenantDto,
  ): Promise<OnboardingResult> {
    return this.tenantService.createTenant(userId, dto);
  }

  /**
   * GET /tenant/me — the caller's memberships.
   *
   * An empty array is what the frontend onboarding gate (Task 3.6) reads to
   * decide between /dashboard and /onboarding, and it is what the client uses
   * to pick the x-tenant-id it sends afterwards.
   */
  @Get('me')
  findMyTenants(@CurrentUser('id') userId: string) {
    return this.tenantService.findMyTenants(userId);
  }
}
