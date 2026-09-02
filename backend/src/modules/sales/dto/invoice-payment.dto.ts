import { PaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength } from 'class-validator';

const MAX_MONEY = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Una fila del split payment (spec plan §1: "ej. Yape + Efectivo") — un
 *  Invoice puede llevar varias. */
export class InvoicePaymentDto {
  @IsEnum(PaymentMethod, { message: 'Selecciona un medio de pago válido.' })
  method!: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto admite máximo 2 decimales.' })
  @IsPositive({ message: 'El monto debe ser mayor a 0.' })
  @Max(MAX_MONEY, { message: 'El monto ingresado es demasiado alto.' })
  amount!: number;

  /** N° de operación Yape/Plin, voucher de POS, etc. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100, { message: 'La referencia no puede superar los 100 caracteres.' })
  referenceNumber?: string;
}
