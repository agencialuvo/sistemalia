import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'El código debe tener 6 dígitos.' })
  code!: string;
}
