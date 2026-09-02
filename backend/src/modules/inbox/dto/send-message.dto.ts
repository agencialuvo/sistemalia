import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /marketing/inbox/conversations/:id/messages (Task 2.3).
 *
 * Solo texto en este pase: RF-2 también pide adjuntos (imágenes/documentos)
 * al enviar, pero eso implica mapear cada tipo de adjunto a la forma que
 * espera cada Graph/WhatsApp Cloud API distinta — no es solo guardar una URL,
 * como sí hace la ingesta INBOUND (que los recibe ya resueltos desde el
 * webhook de Meta). Queda pendiente de un incremento futuro, documentado
 * igual que el gap de `notes` en Prospect (Feature 11).
 */
export class SendMessageDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'El mensaje no puede estar vacío.' })
  @MaxLength(4096, { message: 'El mensaje no puede superar los 4096 caracteres.' })
  body!: string;
}
