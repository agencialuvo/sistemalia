import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Same "true"/"false" string convention as QueryServicesDto — @Type(() =>
 *  Boolean) would read ?isActive=false as true, so it's matched by hand. */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** Filters for GET /staff (spec §3: especialidad, servicio, texto, estado). */
export class QueryStaffDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'El filtro de especialidad no es válido.' })
  specialtyId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El filtro de servicio no es válido.' })
  serviceId?: string;

  /** Matched case-insensitively against nombre, apellido y colegiatura. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  search?: string;

  /** Omitted means "both": the grid shows active and inactive with a badge. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El filtro de estado debe ser true o false.' })
  isActive?: boolean;
}
