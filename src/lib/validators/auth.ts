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

/** Full body of POST /auth/register, matching the backend RegisterDto. */
export const registerSchema = z.object({
  email: notDisposableEmailSchema,
  password: passwordSchema,
  fullName: z.string().min(2, "El nombre completo debe tener al menos 2 caracteres."),
  recaptchaToken: z.string().min(1, "Verificación anti-bot requerida."),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * What the register FORM validates — only the fields the user actually types.
 *
 * `recaptchaToken` is deliberately excluded: it is produced asynchronously at
 * submit time, so there is no input bound to it and its value is "" while the
 * form is being filled. Validating it here made react-hook-form fail on an
 * invisible field, which silently aborted handleSubmit — the button did
 * nothing, with no error shown and no request sent. Keep form-only fields and
 * request-only fields apart.
 */
export const registerFormSchema = registerSchema.omit({ recaptchaToken: true });
export type RegisterFormInput = z.infer<typeof registerFormSchema>;

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
