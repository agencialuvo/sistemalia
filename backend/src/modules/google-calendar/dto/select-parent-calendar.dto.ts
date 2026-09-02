import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** POST /integrations/google/select-parent — `calendarId` viene de la lista
 *  que devolvió GET /integrations/google/calendars, no es un UUID nuestro
 *  (Google usa direcciones de correo o ids opacos como calendarId). */
export class SelectParentCalendarDto {
  @IsString({ message: 'Selecciona un calendario.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Selecciona un calendario.' })
  calendarId!: string;
}
