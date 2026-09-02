import { Transform } from 'class-transformer';
import { AppointmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** GET /appointments (spec §4: "por rango de fechas, profesional o estado").
 *  Extiende PaginationQueryDto pero page/pageSize quedan opcionales — una
 *  vista de agenda (día/semana) quiere TODAS las citas del rango, no una
 *  página, mismo criterio que PatientQueryDto cuando se omite paginación. */
export class QueryAppointmentsDto extends PaginationQueryDto {
  @IsDateString({}, { message: 'La fecha "desde" no es válida.' })
  dateFrom!: string;

  @IsDateString({}, { message: 'La fecha "hasta" no es válida.' })
  dateTo!: string;

  @IsOptional()
  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffMemberId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El paciente no es válido.' })
  patientId?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'El filtro de estado no es válido.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  status?: AppointmentStatus;
}
