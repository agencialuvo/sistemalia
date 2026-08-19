import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  email!: string;
}
