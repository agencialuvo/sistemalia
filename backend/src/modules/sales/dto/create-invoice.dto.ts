import { InvoiceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { InvoiceItemDto } from './invoice-item.dto';
import { InvoicePaymentDto } from './invoice-payment.dto';

/** SUNAT solo distingue estos dos para persona natural/RUC (spec §2:
 *  "customerDocType (DNI/RUC)"). */
export const CUSTOMER_DOC_TYPES = ['DNI', 'RUC'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /sales/invoices — crear y cobrar un comprobante en una sola llamada
 * (spec §4). `items`/`payments` llegan completos: SalesService recalcula
 * totales, IGV y comisión server-side, nunca confía en lo que el cliente
 * sume — solo usa quantity/unitPrice/method/amount que el usuario ingresó.
 */
export class CreateInvoiceDto {
  @IsEnum(InvoiceType, { message: 'Selecciona un tipo de comprobante válido.' })
  type!: InvoiceType;

  @IsOptional()
  @IsUUID('4', { message: 'El paciente no es válido.' })
  patientId?: string;

  /** Cita que se está cobrando (spec plan §1) — opcional, una venta directa
   *  de mostrador no tiene cita asociada. */
  @IsOptional()
  @IsUUID('4', { message: 'La cita no es válida.' })
  appointmentId?: string;

  @IsOptional()
  @IsIn(CUSTOMER_DOC_TYPES, { message: 'El tipo de documento debe ser DNI o RUC.' })
  customerDocType?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(20, { message: 'El número de documento no puede superar los 20 caracteres.' })
  customerDocNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200, { message: 'El nombre no puede superar los 200 caracteres.' })
  customerName?: string;

  @IsArray({ message: 'El comprobante debe llevar al menos un ítem.' })
  @ArrayMinSize(1, { message: 'El comprobante debe llevar al menos un ítem.' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @IsArray({ message: 'El comprobante debe llevar al menos un pago.' })
  @ArrayMinSize(1, { message: 'El comprobante debe llevar al menos un pago.' })
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentDto)
  payments!: InvoicePaymentDto[];
}
