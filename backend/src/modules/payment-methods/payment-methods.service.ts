import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethodType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

const RECORD_NOT_FOUND = 'P2025';

/** Required keys of `details` per método — used by both the presence check
 *  below and by the frontend form, so a method the AI reads later never has
 *  a hole where the phone number or account number should be. */
const REQUIRED_DETAIL_KEYS: Record<PaymentMethodType, string[]> = {
  [PaymentMethodType.MERCADO_PAGO]: ['accessToken'],
  [PaymentMethodType.YAPE]: ['phoneNumber', 'holderName'],
  [PaymentMethodType.PLIN]: ['phoneNumber', 'holderName'],
  [PaymentMethodType.BANK_ACCOUNT]: ['bankName', 'accountNumber', 'holderName'],
  [PaymentMethodType.OTHER]: ['instructions'],
};

/**
 * Configuración de métodos de cobro (menú "Métodos de pago") — Mercado Pago,
 * Yape, Plin, cuenta bancaria u otro, que el agente de IA lee más adelante
 * para generar el link de pago que le corresponde a cada uno.
 *
 * No hay lógica de "en uso, no se puede borrar" como en categorías o
 * especialidades: nada más referencia todavía un PaymentMethodConfig, así que
 * el borrado es siempre definitivo.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.paymentMethodConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreatePaymentMethodDto) {
    this.assertDetailsShape(dto.type, dto.details);

    return this.prisma.paymentMethodConfig.create({
      data: {
        tenantId,
        type: dto.type,
        label: dto.label,
        isEnabled: dto.isEnabled ?? true,
        details: dto.details as Prisma.InputJsonValue,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdatePaymentMethodDto) {
    const current = await this.prisma.paymentMethodConfig.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('El método de pago no existe o no pertenece a tu centro estético.');
    }

    const effectiveType = dto.type ?? current.type;
    const effectiveDetails = (dto.details ?? current.details) as Record<string, unknown>;
    this.assertDetailsShape(effectiveType, effectiveDetails);

    try {
      return await this.prisma.paymentMethodConfig.update({
        where: { id, tenantId },
        data: {
          type: effectiveType,
          label: dto.label ?? current.label,
          isEnabled: dto.isEnabled ?? current.isEnabled,
          details: effectiveDetails as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === RECORD_NOT_FOUND) {
        throw new NotFoundException('El método de pago no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<{ id: string; deleted: true }> {
    const current = await this.prisma.paymentMethodConfig.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('El método de pago no existe o no pertenece a tu centro estético.');
    }
    await this.prisma.paymentMethodConfig.delete({ where: { id, tenantId } });
    return { id, deleted: true };
  }

  /** Every type has a different reason to exist ("cobrar por Yape" needs a
   *  phone, "Mercado Pago" needs a token), so this is the one place that
   *  actually enforces the AI never reads a method with a missing field. */
  private assertDetailsShape(type: PaymentMethodType, details: Record<string, unknown>): void {
    const required = REQUIRED_DETAIL_KEYS[type];
    const missing = required.filter((key) => {
      const value = details?.[key];
      return typeof value !== 'string' || value.trim().length === 0;
    });
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan datos para este método de pago: ${missing.join(', ')}.`,
      );
    }
  }
}
