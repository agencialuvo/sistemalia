import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { IsNotDisposableEmail } from '../validators/is-not-disposable-email.validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotDisposableEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @Matches(/(?=.*[a-z])/, { message: 'La contraseña debe incluir al menos una minúscula.' })
  @Matches(/(?=.*[A-Z])/, { message: 'La contraseña debe incluir al menos una mayúscula.' })
  @Matches(/(?=.*\d)/, { message: 'La contraseña debe incluir al menos un número.' })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres.' })
  fullName!: string;

  @IsString()
  @IsNotEmpty({ message: 'recaptchaToken es requerido.' })
  recaptchaToken!: string;
}
