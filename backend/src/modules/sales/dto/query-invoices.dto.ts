import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** GET /sales/invoices (spec §4: "filtros por fecha y estado"). */
export class QueryInvoicesDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'La fecha "desde" no es válida.' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha "hasta" no es válida.' })
  dateTo?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus, { message: 'El filtro de estado no es válido.' })
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(InvoiceType, { message: 'El filtro de tipo no es válido.' })
  type?: InvoiceType;

  @IsOptional()
  @IsUUID('4', { message: 'El filtro de paciente no es válido.' })
  patientId?: string;
}
