import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

/** Strict "HH:mm", 24h. Matches BranchWorkingHour's convention (spec §1.4). */
export const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One day of the weekly matrix (spec §4, Tab 3). Sent as `schedules: []` on
 * both create and update — StaffMembersService.syncSchedules() replaces the
 * full set rather than patching individual days, so the frontend always
 * submits the complete week it is showing.
 */
export class StaffScheduleInputDto {
  @Type(() => Number)
  @IsInt({ message: 'El día de la semana debe ser un número entero.' })
  @Min(0, { message: 'El día de la semana debe estar entre 0 (Domingo) y 6 (Sábado).' })
  @Max(6, { message: 'El día de la semana debe estar entre 0 (Domingo) y 6 (Sábado).' })
  dayOfWeek!: number;

  @Matches(TIME_HHMM, { message: 'La hora de inicio debe tener formato HH:mm.' })
  startTime!: string;

  @Matches(TIME_HHMM, { message: 'La hora de fin debe tener formato HH:mm.' })
  endTime!: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'La hora de inicio de almuerzo debe tener formato HH:mm.' })
  lunchStartTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'La hora de fin de almuerzo debe tener formato HH:mm.' })
  lunchEndTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
