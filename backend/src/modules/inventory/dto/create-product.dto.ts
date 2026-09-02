import { ProductType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Types that sell directly to the patient — `salePrice` only becomes
 *  mandatory for these (spec §1.4: "Todo producto con tipo PRODUCTO DE VENTA
 *  o AMBOS debe contar con Precio de Venta"). */
const SALE_PRICE_REQUIRED_TYPES: ProductType[] = [ProductType.RETAIL, ProductType.BOTH];

/** Decimal(10,2) tops out at 99 999 999.99; this is the business-sane ceiling
 *  for a unit cost/price (same reasoning as Service's MAX_PRICE). */
const MAX_MONEY = 999_999.99;
/** A stock quantity in the thousands is already an unusual insumo count for a
 *  centro estético — guards against a typo padding several zeros. */
const MAX_QUANTITY = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** POST /inventory/products (spec §2, §4). */
export class CreateProductDto {
  @IsString({ message: 'El nombre del producto es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El nombre del producto es obligatorio.' })
  @MaxLength(160, { message: 'El nombre no puede superar los 160 caracteres.' })
  name!: string;

  @IsString({ message: 'El SKU es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El SKU es obligatorio.' })
  @MaxLength(60, { message: 'El SKU no puede superar los 60 caracteres.' })
  sku!: string;

  @IsEnum(ProductType, { message: 'Selecciona un tipo de producto válido.' })
  type!: ProductType;

  @IsOptional()
  @IsUUID('4', { message: 'La categoría seleccionada no es válida.' })
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(120, { message: 'La marca/laboratorio no puede superar los 120 caracteres.' })
  brand?: string;

  @IsString({ message: 'La unidad de medida es obligatoria.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'La unidad de medida es obligatoria.' })
  @MaxLength(30, { message: 'La unidad de medida no puede superar los 30 caracteres.' })
  unitOfMeasure!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El stock mínimo admite máximo 2 decimales.' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo.' })
  @Max(MAX_QUANTITY, { message: 'El stock mínimo ingresado es demasiado alto.' })
  minStock?: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El costo admite máximo 2 decimales.' })
  @Min(0, { message: 'El costo no puede ser negativo.' })
  @Max(MAX_MONEY, { message: 'El costo ingresado es demasiado alto.' })
  costPrice!: number;

  // Decorator order here is load-bearing: class-validator registers these
  // bottom-up (each decorator factory runs before the one above it), so with
  // `stopAtFirstError` the FIRST constraint reported is whichever is declared
  // LAST. IsNotEmpty is kept last so a missing cell reports "es obligatorio"
  // instead of a misleading "es demasiado alto" from @Max seeing `undefined`.
  // Min is 0.01, not 0: "Los productos de venta directa requieren un Precio
  // de Venta" also rejects an explicit 0, which IsNotEmpty alone would not
  // catch (0 is not an "empty" value).
  @ValidateIf((dto: CreateProductDto) => SALE_PRICE_REQUIRED_TYPES.includes(dto.type))
  @Max(MAX_MONEY, { message: 'El precio de venta ingresado es demasiado alto.' })
  @Min(0.01, { message: 'Los productos de venta directa requieren un Precio de Venta mayor a 0.' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio de venta admite máximo 2 decimales.' })
  @IsNotEmpty({ message: 'Los productos de venta directa requieren un Precio de Venta.' })
  salePrice?: number;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  isActive?: boolean;
}
