import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @Matches(/(?=.*[a-z])/, { message: 'La contraseña debe incluir al menos una minúscula.' })
  @Matches(/(?=.*[A-Z])/, { message: 'La contraseña debe incluir al menos una mayúscula.' })
  @Matches(/(?=.*\d)/, { message: 'La contraseña debe incluir al menos un número.' })
  newPassword!: string;
}
