import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const MAX_MONEY = 999_999.99;

/** POST /sales/cash-registers/close — spec §3.5 (arqueo): `finalBalance` es
 *  el conteo físico real que el usuario ingresa; `expectedBalance` y
 *  `difference` los calcula SalesService, no llegan en el body. */
export class CloseCashDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El saldo final admite máximo 2 decimales.' })
  @Min(0, { message: 'El saldo final no puede ser negativo.' })
  @Max(MAX_MONEY, { message: 'El saldo final ingresado es demasiado alto.' })
  finalBalance!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Las notas no pueden superar los 500 caracteres.' })
  notes?: string;
}
