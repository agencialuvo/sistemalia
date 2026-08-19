import { z } from "zod";
import { DISPOSABLE_EMAIL_DOMAINS } from "./disposable-email-domains";

const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .regex(/[a-z]/, "La contraseña debe incluir al menos una minúscula.")
  .regex(/[A-Z]/, "La contraseña debe incluir al menos una mayúscula.")
  .regex(/\d/, "La contraseña debe incluir al menos un número.");

const notDisposableEmailSchema = z
  .string()
  .email("El correo electrónico no es válido.")
  .refine((email) => {
    const domain = email.split("@")[1]?.toLowerCase().trim();
    return !!domain && !DISPOSABLE_EMAIL_DOMAINS.has(domain);
  }, "Este dominio de correo no está permitido (correos temporales/desechables).");

export const registerSchema = z.object({
  email: notDisposableEmailSchema,
  password: passwordSchema,
  fullName: z.string().min(2, "El nombre completo debe tener al menos 2 caracteres."),
  recaptchaToken: z.string().min(1, "Verificación anti-bot requerida."),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("El correo electrónico no es válido."),
  password: z.string().min(1, "La contraseña es requerida."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  email: z.string().email("El correo electrónico no es válido."),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos numéricos."),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("El correo electrónico no es válido."),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token de restablecimiento requerido."),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
