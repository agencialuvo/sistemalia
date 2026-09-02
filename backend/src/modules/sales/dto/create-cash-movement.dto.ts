import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString, Max, MaxLength } from 'class-validator';

const MAX_MONEY = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Tipos que este endpoint acepta directamente — INITIAL_BALANCE lo genera
 *  openCashRegister y INCOME_SALE lo genera createInvoice; ninguno de los dos
 *  se registra a mano (tasks.md Fase 1, Task 1.3). */
export const MANUAL_CASH_MOVEMENT_TYPES = ['MANUAL_INCOME', 'EXPENSE_OUT', 'COMMISSION_PAYMENT'] as const;
export type ManualCashMovementType = (typeof MANUAL_CASH_MOVEMENT_TYPES)[number];

/** POST /sales/cash-registers/movements — ingreso/egreso manual (spec plan
 *  §1 Pestaña 3: "Pago de movilidad, compra de insumo menor"). No está en la
 *  tabla de 6 endpoints de spec.md §4, pero tasks.md Task 1.3 pide su DTO
 *  explícitamente y plan.md describe el formulario — sin este endpoint el
 *  formulario no tendría a dónde escribir. */
export class CreateCashMovementDto {
  @IsIn(MANUAL_CASH_MOVEMENT_TYPES, { message: 'El tipo de movimiento no es válido.' })
  type!: ManualCashMovementType;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto admite máximo 2 decimales.' })
  @IsPositive({ message: 'El monto debe ser mayor a 0.' })
  @Max(MAX_MONEY, { message: 'El monto ingresado es demasiado alto.' })
  amount!: number;

  @IsString({ message: 'Indica el concepto del movimiento.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Indica el concepto del movimiento.' })
  @MaxLength(300, { message: 'El concepto no puede superar los 300 caracteres.' })
  concept!: string;
}
