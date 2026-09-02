import { Transform } from 'class-transformer';
import { ProspectStatus, SocialChannelProvider } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** GET /marketing/prospects — filtros por estado y canal de origen (spec
 *  RF-2: "Búsqueda, filtrado por estado... y por origen de canal"). */
export class QueryProspectsDto extends PaginationQueryDto {
  /** Coincide contra nombre, teléfono y correo — mismo criterio de "buscador
   *  universal" que PatientQueryDto.search. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(ProspectStatus, { message: 'El filtro de estado no es válido.' })
  status?: ProspectStatus;

  /** "Por origen de canal" (spec RF-2) filtra por `sourceProvider`, no por
   *  `channelId` — un tenant quiere ver "todos los leads de Facebook", no
   *  "los leads de esta Página específica". */
  @IsOptional()
  @IsEnum(SocialChannelProvider, { message: 'El filtro de canal no es válido.' })
  sourceProvider?: SocialChannelProvider;
}
