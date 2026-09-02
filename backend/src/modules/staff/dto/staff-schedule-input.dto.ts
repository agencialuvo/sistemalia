import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Strict "HH:mm", 24h. Matches BranchWorkingHour's convention (spec §1.4). */
export const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Un descanso dentro de un turno (Engine de Disponibilidad, inspirado en
 * JetAppointment) — reemplaza el par fijo lunchStartTime/lunchEndTime que
 * antes vivía directamente en el día: un turno puede ahora tener cero, uno o
 * varios descansos, cada uno con su propio concepto ("Almuerzo", "Descanso").
 */
export class StaffBreakInputDto {
  @Matches(TIME_HHMM, { message: 'La hora de inicio del descanso debe tener formato HH:mm.' })
  startTime!: string;

  @Matches(TIME_HHMM, { message: 'La hora de fin del descanso debe tener formato HH:mm.' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'El concepto no puede superar los 60 caracteres.' })
  label?: string;
}

/**
 * Un turno dentro de un día (ej. "mañana", "tarde"). Multi-shift: un día
 * puede tener varios turnos en vez de un único rango startTime/endTime, y
 * cada uno puede restringirse a un solo servicio ("Botox solo por la
 * mañana") dejando `serviceId` vacío para que aplique a todos.
 */
export class StaffScheduleShiftInputDto {
  @Matches(TIME_HHMM, { message: 'La hora de inicio debe tener formato HH:mm.' })
  startTime!: string;

  @Matches(TIME_HHMM, { message: 'La hora de fin debe tener formato HH:mm.' })
  endTime!: string;

  /** Vacío = el turno aplica a cualquier servicio habilitado del profesional. */
  @IsOptional()
  @IsUUID('4', { message: 'Selecciona un servicio válido.' })
  serviceId?: string;

  @IsOptional()
  @IsArray({ message: 'Los descansos deben ser una lista.' })
  @ArrayMaxSize(10, { message: 'Un turno admite como máximo 10 descansos.' })
  @ValidateNested({ each: true })
  @Type(() => StaffBreakInputDto)
  breaks?: StaffBreakInputDto[];
}

/**
 * Un día de la semana con uno o más turnos (spec §4, Tab 3 — "+ Agregar
 * Turno"). Sent as `schedules: []` on both create and update —
 * StaffMembersService replaces the whole week rather than patching
 * individual days, so the frontend always submits the complete matrix it is
 * showing.
 */
export class StaffScheduleDayInputDto {
  @Type(() => Number)
  @IsInt({ message: 'El día de la semana debe ser un número entero.' })
  @Min(0, { message: 'El día de la semana debe estar entre 0 (Domingo) y 6 (Sábado).' })
  @Max(6, { message: 'El día de la semana debe estar entre 0 (Domingo) y 6 (Sábado).' })
  dayOfWeek!: number;

  @IsArray({ message: 'Los turnos deben ser una lista.' })
  @ArrayMaxSize(10, { message: 'Un día admite como máximo 10 turnos.' })
  @ValidateNested({ each: true })
  @Type(() => StaffScheduleShiftInputDto)
  shifts!: StaffScheduleShiftInputDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
