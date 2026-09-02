import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const MAX_MONEY = 999_999.99;

/** POST /sales/cash-registers/open (spec §4). */
export class OpenCashDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El saldo inicial admite máximo 2 decimales.' })
  @Min(0, { message: 'El saldo inicial no puede ser negativo.' })
  @Max(MAX_MONEY, { message: 'El saldo inicial ingresado es demasiado alto.' })
  initialBalance!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Las notas no pueden superar los 500 caracteres.' })
  notes?: string;
}
