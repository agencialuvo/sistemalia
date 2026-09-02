import { Transform } from 'class-transformer';
import { Gender, PatientStatus } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** "VIP,Frecuente" -> ["VIP", "Frecuente"] — same free-text-in-a-query-param
 *  shape as everywhere else in this DTO (search, isActive as "true"/"false"). */
const toStringArray = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return value;
};

/** Filters for GET /patients (spec §3: búsqueda rápida + tags/status). */
export class PatientQueryDto extends PaginationQueryDto {
  /** Matched case-insensitively against nombre, apellido, documento, teléfono
   *  y correo (spec plan §1: "Buscador universal… Nombre, DNI, Teléfono"). */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(PatientStatus, { message: 'El filtro de estado no es válido.' })
  status?: PatientStatus;

  @IsOptional()
  @IsEnum(Gender, { message: 'El filtro de género no es válido.' })
  gender?: Gender;

  /** A patient matching ANY of the given tags is included. */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray({ message: 'El filtro de etiquetas debe ser una lista.' })
  @IsString({ each: true })
  tags?: string[];

  /** Cheap "cuántos" without a dedicated /patients/stats route — the frontend
   *  reads `.total` off a `pageSize=1` call with this filter to compute
   *  "Nuevos este mes" without pulling every row across the wire. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha "desde" no es válida.' })
  createdFrom?: string;
}
