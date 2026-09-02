import { ConversationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * PATCH /marketing/inbox/conversations/:id (Task 2.4, spec plan §2: "Cambia
 * estado o asigna un usuario responsable").
 */
export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(ConversationStatus, { message: 'El estado no es válido.' })
  status?: ConversationStatus;

  /** `null` explícito desasigna — mismo criterio que
   *  UpdateProspectDto.assignedUserId. */
  @IsOptional()
  @IsUUID('4', { message: 'El usuario asignado no es válido.' })
  assignedUserId?: string | null;
}
