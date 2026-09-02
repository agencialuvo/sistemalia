import { Type } from 'class-transformer';
import { CommissionType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One checked cell of the matriz de competencias (JetAppointment-style
 * asignación masiva) — a professional that can perform a service.
 *
 * `customDurationMinutes` is optional and, when omitted, leaves whatever the
 * pair already had untouched (see StaffMembersService.bulkSyncServiceMatrix's
 * doc comment) — the matrix UI never edits it, only StaffFormDialog's Tab 2
 * does, so a save from the grid can't silently wipe a per-professional
 * override.
 */
export class StaffServiceMatrixEntryDto {
  @IsUUID('4')
  staffMemberId!: string;

  @IsUUID('4')
  serviceId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  customDurationMinutes?: number;

  /** Nivel 1 (custom) del Esquema de Comisiones Jerárquico — same
   *  absent-means-untouched convention as customDurationMinutes above: the
   *  matrix chip's commission editor can save just this pair's override
   *  without disturbing duration/buffer overrides set elsewhere. */
  @IsOptional()
  @IsEnum(CommissionType, { message: 'El tipo de comisión no es válido.' })
  customCommissionType?: CommissionType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  customCommissionValue?: number;
}

/**
 * POST /staff/services/bulk-matrix.
 *
 * `serviceIds` is the sync SCOPE, not just a byproduct of `assignments`: it
 * names every service column this call is allowed to touch, so the backend
 * can tell "this service has zero checked doctors right now" (delete every
 * row for it) apart from "this call never looked at that service at all"
 * (leave it alone). Without it, ServiceFormDialog's single-service "Personal
 * Asignado" tab — which only ever sends rows for ONE service — could not be
 * told apart from a save that means "unassign everyone", and the whole-grid
 * StaffServiceMatrixDialog could not clear a column nobody left checked.
 */
export class BulkServiceMatrixDto {
  @IsArray({ message: 'serviceIds debe ser una lista.' })
  @IsUUID('4', { each: true, message: 'serviceIds debe contener identificadores válidos.' })
  @ArrayMaxSize(500, { message: 'No se pueden sincronizar más de 500 servicios a la vez.' })
  serviceIds!: string[];

  @IsArray({ message: 'assignments debe ser una lista.' })
  @ValidateNested({ each: true })
  @Type(() => StaffServiceMatrixEntryDto)
  @ArrayMaxSize(5000, { message: 'No se pueden enviar más de 5000 asignaciones a la vez.' })
  assignments!: StaffServiceMatrixEntryDto[];
}
