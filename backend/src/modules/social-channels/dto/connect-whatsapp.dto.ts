import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /marketing/channels/whatsapp/connect — los 3 valores que el flujo
 * *Meta Embedded Signup* del SDK de Facebook entrega en el navegador
 * (Fase 3, Task 3.4, aún no implementada):
 *
 * - `code`: el authorization code de `FB.login()`, se cambia por un token de
 *   negocio en el backend (nunca un token de acceso, así que es seguro que
 *   viaje por el body de este endpoint).
 * - `wabaId`/`phoneNumberId`: el ID de la WhatsApp Business Account y del
 *   número registrado — llegan al navegador vía el evento `postMessage` que
 *   dispara el propio flujo de Embedded Signup al completarse, Meta no los
 *   expone en el `code` de arriba.
 */
export class ConnectWhatsAppDto {
  @IsString({ message: 'El código de autorización de Meta es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El código de autorización de Meta es obligatorio.' })
  code!: string;

  @IsString({ message: 'El ID de la cuenta de WhatsApp Business (WABA) es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El ID de la cuenta de WhatsApp Business (WABA) es obligatorio.' })
  wabaId!: string;

  @IsString({ message: 'El ID del número de WhatsApp es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El ID del número de WhatsApp es obligatorio.' })
  phoneNumberId!: string;
}
