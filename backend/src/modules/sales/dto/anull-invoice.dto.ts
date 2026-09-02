import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** PATCH /sales/invoices/:id/anull. */
export class AnullInvoiceDto {
  @IsString({ message: 'Indica el motivo de la anulación.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Indica el motivo de la anulación.' })
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres.' })
  reason!: string;
}
