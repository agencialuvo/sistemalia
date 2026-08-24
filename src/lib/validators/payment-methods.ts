import { z } from "zod";

/** Mirrors backend/src/modules/payment-methods (menú "Métodos de pago"). */

export const PAYMENT_METHOD_TYPES = [
  "MERCADO_PAGO",
  "YAPE",
  "PLIN",
  "BANK_ACCOUNT",
  "OTHER",
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export interface PaymentMethodConfig {
  id: string;
  tenantId: string;
  type: PaymentMethodType;
  label: string;
  isEnabled: boolean;
  details: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

const requiredText = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} es obligatorio.`).max(max, `${label} es demasiado largo.`);

/**
 * One schema per tipo's `details` shape — mirrors
 * PaymentMethodsService.REQUIRED_DETAIL_KEYS on the backend field for field,
 * so a form the user can submit never produces the 400 the API would send
 * back for a missing key.
 */
export const paymentMethodDetailSchemas: Record<PaymentMethodType, z.ZodObject<z.ZodRawShape>> = {
  MERCADO_PAGO: z.object({
    accessToken: requiredText("El access token", 255),
  }),
  YAPE: z.object({
    phoneNumber: requiredText("El número de celular", 20),
    holderName: requiredText("El nombre del titular"),
  }),
  PLIN: z.object({
    phoneNumber: requiredText("El número de celular", 20),
    holderName: requiredText("El nombre del titular"),
  }),
  BANK_ACCOUNT: z.object({
    bankName: requiredText("El banco", 80),
    accountNumber: requiredText("El número de cuenta", 40),
    holderName: requiredText("El nombre del titular"),
    cci: z.string().trim().max(40, "El CCI es demasiado largo.").optional().or(z.literal("")),
  }),
  OTHER: z.object({
    instructions: requiredText("Las instrucciones", 500),
  }),
};

/** Field-level form for one `details` key — used to render the dynamic form
 *  per tipo without a big switch statement in the component. */
export interface PaymentMethodFieldDef {
  key: string;
  labelKey: string;
  placeholder: string;
  optional?: boolean;
  multiline?: boolean;
  secret?: boolean;
}

export const PAYMENT_METHOD_FIELDS: Record<PaymentMethodType, PaymentMethodFieldDef[]> = {
  MERCADO_PAGO: [
    { key: "accessToken", labelKey: "accessToken", placeholder: "APP_USR-...", secret: true },
  ],
  YAPE: [
    { key: "phoneNumber", labelKey: "phoneNumber", placeholder: "999 888 777" },
    { key: "holderName", labelKey: "holderName", placeholder: "Nombre del titular" },
  ],
  PLIN: [
    { key: "phoneNumber", labelKey: "phoneNumber", placeholder: "999 888 777" },
    { key: "holderName", labelKey: "holderName", placeholder: "Nombre del titular" },
  ],
  BANK_ACCOUNT: [
    { key: "bankName", labelKey: "bankName", placeholder: "BCP, Interbank, BBVA…" },
    { key: "accountNumber", labelKey: "accountNumber", placeholder: "191-1234567-0-12" },
    { key: "holderName", labelKey: "holderName", placeholder: "Nombre del titular" },
    { key: "cci", labelKey: "cci", placeholder: "002-191-001234567012-34", optional: true },
  ],
  OTHER: [{ key: "instructions", labelKey: "instructions", placeholder: "", multiline: true }],
};

export const EMPTY_DETAILS: Record<PaymentMethodType, Record<string, string>> = {
  MERCADO_PAGO: { accessToken: "" },
  YAPE: { phoneNumber: "", holderName: "" },
  PLIN: { phoneNumber: "", holderName: "" },
  BANK_ACCOUNT: { bankName: "", accountNumber: "", holderName: "", cci: "" },
  OTHER: { instructions: "" },
};

export const paymentMethodSchema = z
  .object({
    type: z.enum(PAYMENT_METHOD_TYPES),
    label: z.string().trim().min(1, "El nombre es obligatorio.").max(80, "Máximo 80 caracteres."),
    isEnabled: z.boolean(),
    details: z.record(z.string(), z.string()),
  })
  .superRefine((data, ctx) => {
    const result = paymentMethodDetailSchemas[data.type].safeParse(data.details);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["details", ...issue.path] });
      }
    }
  });

export type PaymentMethodFormInput = z.infer<typeof paymentMethodSchema>;

export const EMPTY_PAYMENT_METHOD_FORM: PaymentMethodFormInput = {
  type: "YAPE",
  label: "",
  isEnabled: true,
  details: EMPTY_DETAILS.YAPE,
};

export function toPaymentMethodForm(method: PaymentMethodConfig): PaymentMethodFormInput {
  return {
    type: method.type,
    label: method.label,
    isEnabled: method.isEnabled,
    details: { ...EMPTY_DETAILS[method.type], ...method.details },
  };
}
