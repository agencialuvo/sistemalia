import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SelectParentCalendarDto } from './dto/select-parent-calendar.dto';
import { GoogleCalendarService } from './google-calendar.service';

/**
 * Feature 09 — Google Calendar Jerárquico (Fase 2). Separado de
 * `AuthController`'s `/auth/google*` a propósito: ese flujo es "Continuar
 * con Google" (login, scope `email profile`); este es una acción de admin
 * dentro de un centro ya autenticado, con scope de escritura sobre Calendar.
 */
@Controller('integrations/google')
export class GoogleCalendarController {
  constructor(
    private readonly googleCalendar: GoogleCalendarService,
    private readonly config: ConfigService,
  ) {}

  /** GET /integrations/google/connect — el frontend abre la URL devuelta en
   *  una pestaña/redirect propio en vez de que este endpoint redirija él
   *  mismo, para poder mostrar un botón "Conectar con Google" normal en vez
   *  de depender de un <a href> directo al backend. */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  async connect(@TenantId() tenantId: string): Promise<{ url: string }> {
    const url = await this.googleCalendar.getAuthUrl(tenantId);
    return { url };
  }

  /**
   * GET /integrations/google/callback — Google redirige aquí tras el
   * consentimiento. Es una navegación de nivel superior del navegador, sin
   * header `x-tenant-id` ni `Authorization`, así que esta ruta NO usa
   * `JwtAuthGuard`/`@TenantId()`: el tenant viaja en `state` (ver
   * GoogleCalendarService.getAuthUrl / redis.constants.ts). Siempre termina
   * en una redirección al frontend, nunca en un JSON — nadie ve esta
   * respuesta directamente.
   */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const redirectTo = (status: 'connected' | 'error') =>
      res.redirect(`${frontendUrl}/integraciones?googleCalendar=${status}`);

    if (error || !code || !state) {
      redirectTo('error');
      return;
    }

    try {
      await this.googleCalendar.handleCallback(code, state);
      redirectTo('connected');
    } catch {
      redirectTo('error');
    }
  }

  /** GET /integrations/google/status. */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@TenantId() tenantId: string) {
    return this.googleCalendar.getStatus(tenantId);
  }

  /** GET /integrations/google/calendars. */
  @Get('calendars')
  @UseGuards(JwtAuthGuard)
  listCalendars(@TenantId() tenantId: string) {
    return this.googleCalendar.listCalendars(tenantId);
  }

  /** POST /integrations/google/select-parent. */
  @Post('select-parent')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async selectParent(
    @TenantId() tenantId: string,
    @Body() dto: SelectParentCalendarDto,
  ): Promise<{ success: true }> {
    await this.googleCalendar.selectParentCalendar(tenantId, dto.calendarId);
    return { success: true };
  }

  /** DELETE /integrations/google/disconnect. */
  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disconnect(@TenantId() tenantId: string): Promise<{ success: true }> {
    await this.googleCalendar.disconnect(tenantId);
    return { success: true };
  }
}
