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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnullInvoiceDto } from './dto/anull-invoice.dto';
import { CloseCashDto } from './dto/close-cash.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { OpenCashDto } from './dto/open-cash.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { SalesService } from './sales.service';

const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Módulo 08 — Ventas, Caja Chica y Facturación Electrónica (spec §4).
 *
 * ROUTE ORDER: los sub-recursos estáticos de /invoices (ninguno en Fase 1
 * además de /:id/anull) y de /cash-registers (current/open/close/movements)
 * van todos bajo prefijos propios, así que no compiten entre sí ni con
 * /invoices/:id — mismo cuidado de orden que AppointmentsController.
 */
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('cash-registers/current')
  getCurrentCashRegister(@TenantId() tenantId: string) {
    return this.sales.getCurrentCashRegister(tenantId);
  }

  @Post('cash-registers/open')
  @HttpCode(HttpStatus.CREATED)
  openCashRegister(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OpenCashDto,
  ) {
    return this.sales.openCashRegister(tenantId, userId, dto);
  }

  @Post('cash-registers/close')
  closeCashRegister(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CloseCashDto,
  ) {
    return this.sales.closeCashRegister(tenantId, userId, dto);
  }

  @Post('cash-registers/movements')
  @HttpCode(HttpStatus.CREATED)
  registerCashMovement(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.sales.registerCashMovement(tenantId, userId, dto);
  }

  @Get('invoices')
  listInvoices(@TenantId() tenantId: string, @Query() query: QueryInvoicesDto) {
    return this.sales.listInvoices(tenantId, query);
  }

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  createInvoice(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.sales.createInvoice(tenantId, userId, dto);
  }

  @Get('invoices/:id')
  getInvoice(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.sales.getInvoice(tenantId, id);
  }

  @Patch('invoices/:id/anull')
  anullInvoice(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: AnullInvoiceDto,
  ) {
    return this.sales.anullInvoice(tenantId, userId, id, dto);
  }
}
