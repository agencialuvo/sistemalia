import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** POST /patients/:id/notes (spec §2/§3). */
export class CreateClinicalNoteDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El título de la nota es obligatorio.' })
  @MaxLength(150, { message: 'El título no puede superar los 150 caracteres.' })
  title!: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El contenido de la nota es obligatorio.' })
  @MaxLength(10000, { message: 'El contenido no puede superar los 10000 caracteres.' })
  content!: string;

  /** true = visible solo para el equipo médico, no en el resto de la ficha
   *  360°. Default false (nota compartida) — decidido en el servicio, no aquí. */
  @IsOptional()
  @IsBoolean({ message: 'La privacidad debe ser verdadero o falso.' })
  isPrivate?: boolean;
}
