import { PaymentMethodType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /payment-methods.
 *
 * `details` varies by `type` (teléfono Yape/Plin, datos de cuenta bancaria,
 * credenciales de Mercado Pago) — validated here only as "a plain object",
 * with the real per-type shape checked in PaymentMethodsService against the
 * exact key set each type needs. A discriminated union of DTOs would mean one
 * class per método and still couldn't express "PLIN and YAPE share a shape
 * but MERCADO_PAGO doesn't" any more cleanly.
 */
export class CreatePaymentMethodDto {
  @IsEnum(PaymentMethodType, {
    message: 'El tipo debe ser MERCADO_PAGO, YAPE, PLIN, BANK_ACCOUNT u OTHER.',
  })
  type!: PaymentMethodType;

  @IsString({ message: 'El nombre es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres.' })
  label!: string;

  @IsOptional()
  @IsBoolean({ message: 'Indica con sí o no si el método está activo.' })
  isEnabled?: boolean;

  @IsObject({ message: 'Los datos del método deben ser un objeto.' })
  details!: Record<string, unknown>;
}
