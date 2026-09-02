import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CashMovementType, CashRegister, CommissionType, InvoiceType, Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnullInvoiceDto } from './dto/anull-invoice.dto';
import { CloseCashDto } from './dto/close-cash.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { OpenCashDto } from './dto/open-cash.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import {
  serializeCashMovement,
  serializeCashRegister,
  serializeInvoice,
  serializeInvoiceItem,
  serializePayment,
} from './serializers/sales.serializer';

/** Series fijas por tipo de comprobante (spec §3.3: "B001-00000001,
 *  F001-00000001, NV01-00000001"). Fase 1 no ofrece configurar la serie por
 *  tenant — cada centro emite bajo una única serie por tipo. */
const DEFAULT_SERIES: Record<InvoiceType, string> = {
  BOLETA: 'B001',
  FACTURA: 'F001',
  SALE_NOTE: 'NV01',
};

/** Operación gravada estándar en Perú (spec §3.2). */
const IGV_DIVISOR = 1.18;

/** CashMovementType que suman/restan del arqueo (spec §3.5) — INITIAL_BALANCE
 *  no entra aquí: ya está representado por CashRegister.initialBalance, sumarlo
 *  también lo contaría dos veces. */
const CASH_INCOME_TYPES: CashMovementType[] = ['INCOME_SALE', 'MANUAL_INCOME'];
const CASH_EXPENSE_TYPES: CashMovementType[] = ['EXPENSE_OUT', 'COMMISSION_PAYMENT'];

const INVOICE_ITEM_INCLUDE = {
  service: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, sku: true, unitOfMeasure: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
  batch: { select: { id: true, lotNumber: true } },
} satisfies Prisma.InvoiceItemInclude;

const INVOICE_DETAIL_INCLUDE = {
  items: { include: INVOICE_ITEM_INCLUDE },
  payments: true,
  patient: { select: { id: true, firstName: true, lastName: true, documentNumber: true } },
  appointment: { select: { id: true, startAt: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.InvoiceInclude;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Módulo 08 — Ventas, Caja Chica y Facturación Electrónica (Fase 1: Backend
 * Core). Dos responsabilidades comparten este servicio porque comparten
 * ciclo de vida: no se puede cobrar sin una caja abierta (spec §3.1), y todo
 * cobro deja movimientos de caja — mismo criterio que ClinicalRecordsService
 * compartiendo plantillas y registros.
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // -------------------------------------------------------------------------
  // Caja chica
  // -------------------------------------------------------------------------

  /** GET /sales/cash-registers/current — null si no hay ninguna abierta. */
  async getCurrentCashRegister(tenantId: string) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { tenantId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!register) return null;
    return this.buildCashRegisterSummary(register);
  }

  /** POST /sales/cash-registers/open. */
  async openCashRegister(tenantId: string, userId: string, dto: OpenCashDto) {
    const existing = await this.prisma.cashRegister.findFirst({ where: { tenantId, status: 'OPEN' } });
    if (existing) {
      throw new ConflictException('Ya existe una caja abierta para este centro. Ciérrala antes de abrir una nueva.');
    }

    const register = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashRegister.create({
        data: { tenantId, openedById: userId, initialBalance: dto.initialBalance, notes: dto.notes ?? null },
      });
      await tx.cashMovement.create({
        data: {
          tenantId,
          cashRegisterId: created.id,
          type: 'INITIAL_BALANCE',
          amount: dto.initialBalance,
          concept: 'Apertura de caja',
          performedById: userId,
        },
      });
      return created;
    });

    this.logger.log(`Caja ${register.id} abierta en el centro ${tenantId}.`);
    return this.buildCashRegisterSummary(register);
  }

  /** POST /sales/cash-registers/close — arqueo (spec §3.5). */
  async closeCashRegister(tenantId: string, userId: string, dto: CloseCashDto) {
    const register = await this.prisma.cashRegister.findFirst({ where: { tenantId, status: 'OPEN' } });
    if (!register) {
      throw new BadRequestException('No hay una caja abierta para cerrar.');
    }

    const { expectedBalance } = await this.computeExpectedBalance(register.id, register.initialBalance);
    const finalBalance = new Prisma.Decimal(dto.finalBalance);
    const difference = finalBalance.minus(expectedBalance);

    const updated = await this.prisma.cashRegister.update({
      where: { id: register.id },
      data: {
        status: 'CLOSED',
        finalBalance,
        expectedBalance,
        difference,
        closedById: userId,
        closedAt: new Date(),
        notes: dto.notes ?? register.notes,
      },
    });

    this.logger.log(`Caja ${register.id} cerrada en el centro ${tenantId} (diferencia: ${difference.toFixed(2)}).`);
    return serializeCashRegister(updated);
  }

  /** POST /sales/cash-registers/movements — ingreso/egreso manual. */
  async registerCashMovement(tenantId: string, userId: string, dto: CreateCashMovementDto) {
    const register = await this.prisma.cashRegister.findFirst({ where: { tenantId, status: 'OPEN' } });
    if (!register) {
      throw new BadRequestException('No hay una caja abierta para registrar movimientos.');
    }

    const movement = await this.prisma.cashMovement.create({
      data: {
        tenantId,
        cashRegisterId: register.id,
        type: dto.type,
        amount: dto.amount,
        concept: dto.concept,
        performedById: userId,
      },
    });
    return serializeCashMovement(movement);
  }

  private async computeExpectedBalance(cashRegisterId: string, initialBalance: Prisma.Decimal) {
    const movements = await this.prisma.cashMovement.findMany({ where: { cashRegisterId } });
    const incomes = movements
      .filter((movement) => CASH_INCOME_TYPES.includes(movement.type))
      .reduce((sum, movement) => sum.plus(movement.amount), new Prisma.Decimal(0));
    const expenses = movements
      .filter((movement) => CASH_EXPENSE_TYPES.includes(movement.type))
      .reduce((sum, movement) => sum.plus(movement.amount), new Prisma.Decimal(0));
    return { movements, expectedBalance: initialBalance.plus(incomes).minus(expenses) };
  }

  private async buildCashRegisterSummary(register: CashRegister) {
    const [{ movements }, paymentsByMethod] = await Promise.all([
      this.computeExpectedBalance(register.id, register.initialBalance),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { cashRegisterId: register.id },
        _sum: { amount: true },
      }),
    ]);

    const incomes = movements
      .filter((movement) => CASH_INCOME_TYPES.includes(movement.type))
      .reduce((sum, movement) => sum.plus(movement.amount), new Prisma.Decimal(0));
    const expenses = movements
      .filter((movement) => CASH_EXPENSE_TYPES.includes(movement.type))
      .reduce((sum, movement) => sum.plus(movement.amount), new Prisma.Decimal(0));
    const runningBalance = register.initialBalance.plus(incomes).minus(expenses);

    return {
      ...serializeCashRegister(register),
      runningBalance: runningBalance.toFixed(2),
      movements: [...movements]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(serializeCashMovement),
      paymentsByMethod: paymentsByMethod.map((row) => ({
        method: row.method,
        total: (row._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Comprobantes / Ventas
  // -------------------------------------------------------------------------

  /** GET /sales/invoices. */
  async listInvoices(tenantId: string, query: QueryInvoicesDto) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;

    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          payments: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices.map(({ payments, ...invoice }) => ({
        ...serializeInvoice(invoice),
        patient: invoice.patient,
        itemCount: invoice._count.items,
        payments: payments.map(serializePayment),
      })),
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  /** GET /sales/invoices/:id. */
  async getInvoice(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId }, include: INVOICE_DETAIL_INCLUDE });
    if (!invoice) {
      throw new NotFoundException('El comprobante no existe o no pertenece a tu centro estético.');
    }
    return this.serializeInvoiceDetail(invoice);
  }

  private serializeInvoiceDetail(invoice: Prisma.InvoiceGetPayload<{ include: typeof INVOICE_DETAIL_INCLUDE }>) {
    const { items, payments, ...rest } = invoice;
    return {
      ...serializeInvoice(rest),
      patient: invoice.patient,
      appointment: invoice.appointment,
      createdBy: invoice.createdBy,
      items: items.map((item) => {
        const { service, product, staff, batch, ...itemRest } = item;
        return { ...serializeInvoiceItem(itemRest), service, product, staff, batch };
      }),
      payments: payments.map(serializePayment),
    };
  }

  /**
   * POST /sales/invoices — crea y cobra un comprobante en una sola llamada
   * (spec §4). Server-side siempre: totales, IGV, correlativo y comisión
   * nunca llegan del cliente, solo quantity/unitPrice/method/amount.
   */
  async createInvoice(tenantId: string, userId: string, dto: CreateInvoiceDto) {
    const cashRegister = await this.prisma.cashRegister.findFirst({ where: { tenantId, status: 'OPEN' } });
    if (!cashRegister) {
      throw new BadRequestException('Debes abrir la caja chica antes de procesar cobros.');
    }

    for (const item of dto.items) {
      if (item.serviceId && item.productId) {
        throw new BadRequestException('Un ítem no puede ser servicio y producto a la vez.');
      }
    }

    if (dto.patientId) await this.assertPatientBelongsToTenant(tenantId, dto.patientId);
    if (dto.appointmentId) await this.assertAppointmentBelongsToTenant(tenantId, dto.appointmentId);
    await this.assertItemReferencesBelongToTenant(tenantId, dto.items);

    const itemsComputed = dto.items.map((item) => ({
      ...item,
      totalPrice: round2(item.quantity * item.unitPrice),
    }));
    const total = round2(itemsComputed.reduce((sum, item) => sum + item.totalPrice, 0));
    const paymentsTotal = round2(dto.payments.reduce((sum, payment) => sum + payment.amount, 0));
    if (Math.abs(paymentsTotal - total) > 0.01) {
      throw new BadRequestException('La suma de los pagos no coincide con el total del comprobante.');
    }
    const subtotal = round2(total / IGV_DIVISOR);
    const igv = round2(total - subtotal);
    const series = DEFAULT_SERIES[dto.type];

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.invoiceSeriesCounter.upsert({
        where: { tenantId_type_series: { tenantId, type: dto.type, series } },
        create: { tenantId, type: dto.type, series, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });

      const created = await tx.invoice.create({
        data: {
          tenantId,
          patientId: dto.patientId ?? null,
          appointmentId: dto.appointmentId ?? null,
          cashRegisterId: cashRegister.id,
          type: dto.type,
          series,
          number: counter.lastNumber,
          customerDocType: dto.customerDocType ?? null,
          customerDocNumber: dto.customerDocNumber ?? null,
          customerName: dto.customerName ?? null,
          subtotal,
          igv,
          total,
          createdById: userId,
        },
      });

      for (const item of itemsComputed) {
        let batchId: string | null = null;
        if (item.productId) {
          const movement = await this.inventory.registerRetailSale(tx, tenantId, {
            productId: item.productId,
            batchId: item.batchId,
            quantity: item.quantity,
            referenceId: created.id,
            performedById: userId,
          });
          batchId = movement.batchId;
        }

        const commissionAmount =
          item.serviceId && item.staffId
            ? await this.resolveCommissionAmount(tx, tenantId, item.staffId, item.serviceId, item.totalPrice)
            : null;

        await tx.invoiceItem.create({
          data: {
            invoiceId: created.id,
            serviceId: item.serviceId ?? null,
            productId: item.productId ?? null,
            batchId,
            staffId: item.staffId ?? null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            commissionAmount,
          },
        });
      }

      const invoiceNumberLabel = `${series}-${String(counter.lastNumber).padStart(8, '0')}`;
      for (const payment of dto.payments) {
        await tx.payment.create({
          data: {
            tenantId,
            invoiceId: created.id,
            cashRegisterId: cashRegister.id,
            method: payment.method,
            amount: payment.amount,
            referenceNumber: payment.referenceNumber ?? null,
          },
        });
        if (payment.method === 'CASH') {
          await tx.cashMovement.create({
            data: {
              tenantId,
              cashRegisterId: cashRegister.id,
              type: 'INCOME_SALE',
              amount: payment.amount,
              concept: `Venta ${invoiceNumberLabel}`,
              performedById: userId,
            },
          });
        }
      }

      // Cobrar una cita la cierra automáticamente (tasks.md Fase 3, Task 3.3)
      // — solo si seguía CONFIRMED/IN_SERVICE: no pisa un NO_SHOW/CANCELLED
      // que el staff haya marcado a mano antes de facturar.
      if (dto.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: dto.appointmentId, tenantId, status: { in: ['CONFIRMED', 'IN_SERVICE'] } },
          data: { status: 'COMPLETED' },
        });
      }

      return created.id;
    });

    this.logger.log(`Comprobante ${series}-${invoiceId} emitido en el centro ${tenantId}.`);
    return this.getInvoice(tenantId, invoiceId);
  }

  /** PATCH /sales/invoices/:id/anull — con devolución de stock (spec §4). */
  async anullInvoice(tenantId: string, userId: string, id: string, dto: AnullInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!invoice) {
      throw new NotFoundException('El comprobante no existe o no pertenece a tu centro estético.');
    }
    if (invoice.status !== 'PAID') {
      throw new BadRequestException('Solo se pueden anular comprobantes pagados.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        if (item.productId && item.batchId) {
          await this.inventory.reverseSale(tx, tenantId, {
            batchId: item.batchId,
            quantity: item.quantity.toNumber(),
            referenceId: invoice.id,
            performedById: userId,
          });
        }
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'ANULLED', anulledAt: new Date(), anulledReason: dto.reason },
      });
    });

    this.logger.log(`Comprobante ${invoice.id} anulado en el centro ${tenantId}.`);
    return this.getInvoice(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Comisiones — Esquema Jerárquico (Módulo 03/04, ver resolveCommission en
  // validators/staff.ts del frontend, mismo orden de resolución aquí).
  // -------------------------------------------------------------------------

  private async resolveCommissionAmount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    staffId: string,
    serviceId: string,
    totalPrice: number,
  ): Promise<number | null> {
    const staffService = await tx.staffService.findFirst({
      where: { staffMemberId: staffId, serviceId },
      select: { customCommissionType: true, customCommissionValue: true },
    });
    if (staffService?.customCommissionType && staffService.customCommissionValue) {
      return this.computeCommission(staffService.customCommissionType, staffService.customCommissionValue.toNumber(), totalPrice);
    }

    const service = await tx.service.findFirst({
      where: { id: serviceId, tenantId },
      select: { baseCommissionType: true, baseCommissionValue: true },
    });
    if (service?.baseCommissionType && service.baseCommissionValue) {
      return this.computeCommission(service.baseCommissionType, service.baseCommissionValue.toNumber(), totalPrice);
    }

    const staff = await tx.staffMember.findFirst({
      where: { id: staffId, tenantId },
      select: { defaultCommissionType: true, defaultCommissionValue: true },
    });
    if (staff?.defaultCommissionType && staff.defaultCommissionValue) {
      return this.computeCommission(staff.defaultCommissionType, staff.defaultCommissionValue.toNumber(), totalPrice);
    }

    return null;
  }

  private computeCommission(type: CommissionType, value: number, totalPrice: number): number {
    return round2(type === 'PERCENTAGE' ? (totalPrice * value) / 100 : value);
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  private async assertPatientBelongsToTenant(tenantId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } });
    if (!patient) {
      throw new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
    }
  }

  private async assertAppointmentBelongsToTenant(tenantId: string, appointmentId: string): Promise<void> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { id: true },
    });
    if (!appointment) {
      throw new NotFoundException('La cita no existe o no pertenece a tu centro estético.');
    }
  }

  private async assertItemReferencesBelongToTenant(tenantId: string, items: CreateInvoiceDto['items']): Promise<void> {
    const serviceIds = [...new Set(items.map((item) => item.serviceId).filter((id): id is string => Boolean(id)))];
    const productIds = [...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
    const staffIds = [...new Set(items.map((item) => item.staffId).filter((id): id is string => Boolean(id)))];

    const [services, products, staff] = await Promise.all([
      serviceIds.length
        ? this.prisma.service.findMany({ where: { id: { in: serviceIds }, tenantId }, select: { id: true } })
        : [],
      productIds.length
        ? this.prisma.product.findMany({ where: { id: { in: productIds }, tenantId }, select: { id: true } })
        : [],
      staffIds.length
        ? this.prisma.staffMember.findMany({ where: { id: { in: staffIds }, tenantId }, select: { id: true } })
        : [],
    ]);

    if (services.length !== serviceIds.length) {
      throw new NotFoundException('Uno de los servicios no existe o no pertenece a tu centro estético.');
    }
    if (products.length !== productIds.length) {
      throw new NotFoundException('Uno de los productos no existe o no pertenece a tu centro estético.');
    }
    if (staff.length !== staffIds.length) {
      throw new NotFoundException('Uno de los profesionales no existe o no pertenece a tu centro estético.');
    }
  }
}
