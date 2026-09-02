import { IsDateString, IsEnum } from 'class-validator';

export enum AppointmentGridGroupBy {
  PROFESSIONAL = 'PROFESSIONAL',
  ROOM = 'ROOM',
  EQUIPMENT = 'EQUIPMENT',
}

/**
 * GET /appointments/grid — mismo rango de fechas que QueryAppointmentsDto,
 * pero con los nombres de parámetro pedidos explícitamente para este
 * endpoint (`startDate`/`endDate` en vez de `dateFrom`/`dateTo`); se deja
 * así a propósito en vez de forzarlos a coincidir, ya que este endpoint
 * sirve a un consumidor distinto (la grilla de recursos, no el listado
 * plano de citas).
 */
export class QueryAppointmentsGridDto {
  @IsDateString({}, { message: 'La fecha "desde" no es válida.' })
  startDate!: string;

  @IsDateString({}, { message: 'La fecha "hasta" no es válida.' })
  endDate!: string;

  @IsEnum(AppointmentGridGroupBy, { message: 'El agrupador debe ser PROFESSIONAL, ROOM o EQUIPMENT.' })
  groupBy!: AppointmentGridGroupBy;
}
