import { Transform } from 'class-transformer';
import { ProspectStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * PATCH /marketing/prospects/:id — spec plan §2: "Actualiza estado, notas o
 * usuario asignado". El modelo `Prospect` (Task 1.1) no tiene una columna
 * `notes` propia — a diferencia de Patient, esta feature no la definió en su
 * plan de datos — así que "notas de seguimiento" (spec RF-2) queda pendiente
 * de una migración futura; este DTO cubre lo que sí existe en el modelo:
 * `status`, `assignedUserId` y las 3 columnas de contacto por si recepción
 * necesita corregir un dato mal capturado por el formulario de Meta.
 */
export class UpdateProspectDto {
  @IsOptional()
  @IsEnum(ProspectStatus, { message: 'El estado no es válido.' })
  status?: ProspectStatus;

  /** `null` explícito desasigna — mismo criterio que el resto del backend
   *  (ej. StaffMembersService.buildWritableData con avatarUrl). */
  @IsOptional()
  @IsUUID('4', { message: 'El usuario asignado no es válido.' })
  assignedUserId?: string | null;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres.' })
  fullName?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido.' })
  email?: string;
}
