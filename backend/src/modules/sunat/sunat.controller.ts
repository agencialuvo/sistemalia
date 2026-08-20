import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueryRucDto } from './dto/query-ruc.dto';
import { SunatQueryResult, SunatService } from './sunat.service';

/**
 * Path is spelled out in full because the app has no global `api/v1` prefix —
 * Feature 01 mounted `/auth/*` at the root and the frontend already calls it
 * there. Adding a global prefix now would break those routes, so the versioned
 * path required by spec §2 (Paso 1.4) is declared on this controller alone.
 */
@Controller('api/v1/tax/sunat')
export class SunatController {
  constructor(private readonly sunatService: SunatService) {}

  /**
   * Behind JwtAuthGuard: the endpoint proxies a rate-limited third party and
   * leaks taxpayer data, so it is not open to anonymous callers even though
   * the RUC itself is public information.
   */
  @Get(':ruc')
  @UseGuards(JwtAuthGuard)
  queryRuc(@Param() params: QueryRucDto): Promise<SunatQueryResult> {
    return this.sunatService.queryRuc(params.ruc);
  }
}
