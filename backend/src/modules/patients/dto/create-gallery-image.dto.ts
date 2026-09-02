import { Transform } from 'class-transformer';
import { PatientGalleryCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /patients/:id/gallery (Fase 3, Tab "Galería Antes y Después").
 *
 * `imageUrl` comes from the shared MediaPickerDialog ("Elegir de Medios") —
 * this module never accepts a raw file upload, it only records a reference to
 * an asset already in the Medios library, same as ServiceFormDialog's gallery.
 */
export class CreateGalleryImageDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'La imagen es obligatoria.' })
  @MaxLength(2048, { message: 'La URL de la imagen no es válida.' })
  imageUrl!: string;

  @IsEnum(PatientGalleryCategory, { message: 'La categoría debe ser Antes, Después o Progreso.' })
  category!: PatientGalleryCategory;

  @IsOptional()
  @IsUUID('4', { message: 'El servicio no es válido.' })
  serviceId?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres.' })
  caption?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha no es válida.' })
  takenAt?: string;
}
