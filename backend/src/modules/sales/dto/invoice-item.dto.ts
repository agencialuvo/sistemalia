import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const MAX_QUANTITY = 999_999.99;
const MAX_MONEY = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Un ítem del carrito — un servicio o un producto de inventario, nunca ambos
 * (SalesService lo valida, no class-validator: es una regla entre dos
 * campos). `staffId` dispara el cálculo de comisión (spec §3.4) cuando el
 * ítem es un servicio.
 */
export class InvoiceItemDto {
  @IsOptional()
  @IsUUID('4', { message: 'El servicio no es válido.' })
  serviceId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El producto no es válido.' })
  productId?: string;

  /** Solo aplica cuando hay productId — si se omite, InventoryService aplica
   *  FEFO (lote activo más próximo a vencer). */
  @IsOptional()
  @IsUUID('4', { message: 'El lote seleccionado no es válido.' })
  batchId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffId?: string;

  @IsString({ message: 'La descripción del ítem es obligatoria.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'La descripción del ítem es obligatoria.' })
  @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres.' })
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La cantidad admite máximo 2 decimales.' })
  @IsPositive({ message: 'La cantidad debe ser mayor a 0.' })
  @Max(MAX_QUANTITY, { message: 'La cantidad ingresada es demasiado alta.' })
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio unitario admite máximo 2 decimales.' })
  @Min(0, { message: 'El precio unitario no puede ser negativo.' })
  @Max(MAX_MONEY, { message: 'El precio unitario ingresado es demasiado alto.' })
  unitPrice!: number;
}
