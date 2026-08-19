import { IsEmail } from 'class-validator';

export class ResendOtpDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  email!: string;
}
