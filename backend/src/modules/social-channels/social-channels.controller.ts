import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConnectMetaDto } from './dto/connect-meta.dto';
import { ConnectWhatsAppDto } from './dto/connect-whatsapp.dto';
import { SocialChannelsService } from './social-channels.service';

/** UUID v4 para :id — mismo criterio que ServicesController/StaffController/
 *  PatientsController: un id malformado es un 400 acá, no un error opaco de
 *  Prisma más abajo. */
const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Feature 10 — Integraciones No-Code (Fase 2). Prefijo `marketing/channels`
 * tal como lo fija plan.md §2 — deliberadamente separado de
 * `integrations/google*` (Feature 09): ese es un solo proveedor con su propio
 * flujo OAuth2 clásico, este es un catálogo de múltiples canales/proveedores
 * (Meta, TikTok, WhatsApp) con su propio ciclo de vida por fila.
 */
@Controller('marketing/channels')
@UseGuards(JwtAuthGuard)
export class SocialChannelsController {
  constructor(private readonly socialChannels: SocialChannelsService) {}

  /** GET /marketing/channels. */
  @Get()
  listChannels(@TenantId() tenantId: string) {
    return this.socialChannels.listChannels(tenantId);
  }

  /** POST /marketing/channels/meta/connect. */
  @Post('meta/connect')
  @HttpCode(HttpStatus.OK)
  connectMeta(@TenantId() tenantId: string, @Body() dto: ConnectMetaDto) {
    return this.socialChannels.connectMeta(tenantId, dto.accessToken);
  }

  /** POST /marketing/channels/whatsapp/connect. */
  @Post('whatsapp/connect')
  @HttpCode(HttpStatus.OK)
  connectWhatsApp(@TenantId() tenantId: string, @Body() dto: ConnectWhatsAppDto) {
    return this.socialChannels.connectWhatsApp(tenantId, dto);
  }

  /** DELETE /marketing/channels/:id. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  disconnect(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.socialChannels.disconnectChannel(tenantId, id);
  }
}
