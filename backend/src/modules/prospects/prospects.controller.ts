import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueryProspectsDto } from './dto/query-prospects.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { ProspectsService } from './prospects.service';

/** UUID v4 para :id — mismo criterio que PatientsController/StaffController. */
const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/** Módulo 11 — Prospectos (Ingesta de Lead Ads y CRM), Fase 2 (Task 2.4). */
@Controller('marketing/prospects')
@UseGuards(JwtAuthGuard)
export class ProspectsController {
  constructor(private readonly prospects: ProspectsService) {}

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: QueryProspectsDto) {
    return this.prospects.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.prospects.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateProspectDto,
  ) {
    return this.prospects.update(tenantId, id, dto);
  }

  /** POST /marketing/prospects/:id/convert (spec RF-3) — sin body: todos los
   *  datos del Patient se derivan del Prospect mismo. */
  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  convert(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.prospects.convertToPatient(tenantId, id);
  }
}
