import { describe, expect, it } from "vitest";

import { registerFormSchema, registerSchema } from "./auth";

// Exactly what the register form holds when the user has filled every visible
// field and clicks "Crear cuenta".
const typedByUser = {
  fullName: "Agencia Luvo",
  email: "agencialuvo@gmail.com",
  password: "Prueba1234",
};

describe("registerFormSchema", () => {
  it("accepts the fields the user can actually type", () => {
    // Regression: the form used to validate against registerSchema, which also
    // requires `recaptchaToken`. That field has no input, so it stayed "" and
    // failed min(1) — react-hook-form aborted handleSubmit and the button did
    // nothing, with no visible error and no request sent.
    const result = registerFormSchema.safeParse(typedByUser);
    expect(result.success).toBe(true);
  });

  it("does not require recaptchaToken", () => {
    expect(Object.keys(registerFormSchema.shape)).not.toContain("recaptchaToken");
  });

  it("still enforces the visible field rules", () => {
    expect(registerFormSchema.safeParse({ ...typedByUser, email: "no-es-correo" }).success).toBe(
      false,
    );
    expect(registerFormSchema.safeParse({ ...typedByUser, password: "corta" }).success).toBe(false);
    expect(registerFormSchema.safeParse({ ...typedByUser, fullName: "A" }).success).toBe(false);
    expect(
      registerFormSchema.safeParse({ ...typedByUser, email: "x@mailinator.com" }).success,
    ).toBe(false);
  });
});

describe("registerSchema (contrato del request)", () => {
  it("keeps requiring recaptchaToken for the API call", () => {
    expect(registerSchema.safeParse(typedByUser).success).toBe(false);
  });

  it("accepts the body the page actually posts", () => {
    // onSubmit spreads the form values and attaches the token fetched at
    // submit time; that combination must satisfy the backend contract.
    const result = registerSchema.safeParse({
      ...typedByUser,
      recaptchaToken: "dev-bypass-token",
    });
    expect(result.success).toBe(true);
  });
});
