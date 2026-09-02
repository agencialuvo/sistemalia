import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /marketing/channels/meta/connect — `accessToken` es el token de
 * usuario de CORTA duración que el SDK de Facebook Login devuelve en el
 * navegador tras `FB.login()` (Fase 3, Task 3.4). Nunca es un token de larga
 * duración ni un token de Página: ese intercambio (fb_exchange_token) y el
 * descubrimiento de Páginas/Instagram ocurren enteramente en
 * SocialChannelsService, del lado del servidor — el frontend nunca ve ni
 * maneja tokens de larga duración.
 */
export class ConnectMetaDto {
  @IsString({ message: 'El token de acceso de Meta es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El token de acceso de Meta es obligatorio.' })
  accessToken!: string;
}
