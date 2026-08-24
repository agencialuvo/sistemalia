import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Decimal(10,2) tops out at 99 999 999.99; matches create-service.dto.ts's MAX_PRICE. */
const MAX_PRICE = 999_999.99;

/**
 * One paquete de sesiones (ampliación al spec §2.2, Bloque 2): a SESSIONS
 * service can now offer several of these at once — "3 sesiones" and "6
 * sesiones" of the same tratamiento, each with its own price and frequency.
 */
export class ServicePackageDto {
  @Type(() => Number)
  @IsInt({ message: 'El número de sesiones debe ser un entero.' })
  @Min(2, { message: 'Un paquete debe tener al menos 2 sesiones.' })
  @Max(100, { message: 'Un paquete no puede superar las 100 sesiones.' })
  sessionCount!: number;

  /** Optional: not every treatment imposes a minimum gap between sessions. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Los días entre sesiones deben ser un número entero.' })
  @Min(0, { message: 'Los días entre sesiones no pueden ser negativos.' })
  @Max(365, { message: 'Los días entre sesiones no pueden superar 365.' })
  frequencyDays?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio admite máximo 2 decimales.' })
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio supera el máximo permitido.' })
  price!: number;
}
