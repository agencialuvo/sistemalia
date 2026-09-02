import { Transform } from 'class-transformer';
import { ConversationStatus, SocialChannelProvider } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** GET /marketing/inbox/conversations — spec RF-1: lista de chats con
 *  "indicador visual del canal de origen" y filtro por estado. */
export class QueryConversationsDto extends PaginationQueryDto {
  /** Coincide contra nombre y teléfono de contacto. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(ConversationStatus, { message: 'El filtro de estado no es válido.' })
  status?: ConversationStatus;

  /** Filtra por el proveedor del canal (Facebook/Instagram/WhatsApp), no por
   *  un `channelId` puntual — mismo criterio que
   *  QueryProspectsDto.sourceProvider. */
  @IsOptional()
  @IsEnum(SocialChannelProvider, { message: 'El filtro de canal no es válido.' })
  provider?: SocialChannelProvider;
}
