import { describe, expect, it } from "vitest";

import { tenantOnboardingSchema } from "@/lib/validators/tenant";
import {
  DAY_ORDER,
  EMPTY_ONBOARDING_DRAFT,
  toOnboardingPayload,
  type OnboardingDraft,
} from "./types";

/** A draft in the state it would be in right before "Finalizar". */
function completeDraft(): OnboardingDraft {
  return {
    ...EMPTY_ONBOARDING_DRAFT,
    identityType: "EMPRESA",
    taxIdType: "RUC20",
    taxId: "20131312955",
    legalName: "CENTRO ESTETICO LIA S.A.C.",
    fiscalAddress: "AV. LARCO 123 - MIRAFLORES",
    commercialName: "Clínica LIA",
    specialty: "MEDICINA_ESTETICA",
    branch: {
      ...EMPTY_ONBOARDING_DRAFT.branch,
      address: "Av. Larco 123",
      regionCode: "15",
      provinceCode: "1501",
      ubigeoCode: "150122",
      whatsappNumber: "+51987654321",
    },
  };
}

describe("EMPTY_ONBOARDING_DRAFT", () => {
  it("pre-fills all 7 days so the matrix never renders a hole", () => {
    expect(EMPTY_ONBOARDING_DRAFT.branch.workingHours).toHaveLength(7);
    expect(EMPTY_ONBOARDING_DRAFT.branch.workingHours.map((h) => h.dayOfWeek)).toEqual([
      ...DAY_ORDER,
    ]);
  });

  it("defaults to Mon-Fri open and the weekend closed", () => {
    const open = EMPTY_ONBOARDING_DRAFT.branch.workingHours.filter((h) => h.isOpen);
    expect(open.map((h) => h.dayOfWeek).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("starts the WhatsApp field with a country code prefix", () => {
    expect(EMPTY_ONBOARDING_DRAFT.branch.whatsappNumber).toBe("+51");
  });
});

describe("toOnboardingPayload", () => {
  it("produces a payload the shared schema accepts", () => {
    const result = tenantOnboardingSchema.safeParse(toOnboardingPayload(completeDraft()));
    expect(result.success).toBe(true);
  });

  it("drops the UI-only cascade fields the API would reject", () => {
    // The backend runs forbidNonWhitelisted, so regionCode/provinceCode
    // reaching it would be a 400 rather than an ignored extra.
    const payload = toOnboardingPayload(completeDraft());
    expect(payload.branch).not.toHaveProperty("regionCode");
    expect(payload.branch).not.toHaveProperty("provinceCode");
    expect(payload.branch.ubigeoCode).toBe("150122");
  });

  it("converts an empty break to undefined, not an empty string", () => {
    // "" would fail the HH:mm pattern instead of reading as "no break".
    const payload = toOnboardingPayload(completeDraft());
    const monday = payload.branch.workingHours.find((h) => h.dayOfWeek === 1);
    expect(monday?.breakStart).toBeUndefined();
    expect(monday?.breakEnd).toBeUndefined();
  });

  it("keeps a break that was actually filled in", () => {
    const draft = completeDraft();
    draft.branch.workingHours = draft.branch.workingHours.map((h) =>
      h.dayOfWeek === 1 ? { ...h, breakStart: "13:00", breakEnd: "14:00" } : h,
    );
    const monday = toOnboardingPayload(draft).branch.workingHours.find((h) => h.dayOfWeek === 1);
    expect(monday).toMatchObject({ breakStart: "13:00", breakEnd: "14:00" });
  });

  it("omits an empty fiscal address instead of sending a blank string", () => {
    const draft = completeDraft();
    draft.fiscalAddress = "   ";
    expect(toOnboardingPayload(draft).fiscalAddress).toBeUndefined();
  });

  it("omits logoUrl when no logo was uploaded", () => {
    expect(toOnboardingPayload(completeDraft()).logoUrl).toBeUndefined();
  });

  it("trims whitespace the user leaves in text fields", () => {
    const draft = completeDraft();
    draft.commercialName = "  Clínica LIA  ";
    draft.branch.address = "  Av. Larco 123 ";
    const payload = toOnboardingPayload(draft);
    expect(payload.commercialName).toBe("Clínica LIA");
    expect(payload.branch.address).toBe("Av. Larco 123");
  });

  it("strips spaces from the WhatsApp number so it matches E.164", () => {
    const draft = completeDraft();
    draft.branch.whatsappNumber = "+51 987 654 321";
    const payload = toOnboardingPayload(draft);
    expect(payload.branch.whatsappNumber).toBe("+51987654321");
    expect(tenantOnboardingSchema.safeParse(payload).success).toBe(true);
  });

  it("always sends all 7 days, including the closed ones", () => {
    const payload = toOnboardingPayload(completeDraft());
    expect(payload.branch.workingHours).toHaveLength(7);
    expect(payload.branch.workingHours.filter((h) => !h.isOpen)).toHaveLength(2);
  });
});
