import { describe, expect, it } from "vitest";
import {
  EMPTY_SERVICE_FORM,
  formatDuration,
  formatSoles,
  needsEvaluationLink,
  serviceSchema,
  toServiceForm,
  toServicePayload,
  type Service,
  type ServiceFormInput,
} from "./service";

const CATEGORY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const EVALUATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";

function form(overrides: Partial<ServiceFormInput> = {}): ServiceFormInput {
  return {
    ...EMPTY_SERVICE_FORM,
    name: "Limpieza facial",
    categoryId: CATEGORY_ID,
    commercialDescription: "Higiene facial profunda.",
    singlePrice: "120.00",
    durationMinutes: "60",
    ...overrides,
  };
}

describe("formatSoles", () => {
  it.each([
    ["1200.00", "S/ 1,200.00"],
    ["2400.50", "S/ 2,400.50"],
    ["999999.99", "S/ 999,999.99"],
    ["80.00", "S/ 80.00"],
    ["0.50", "S/ 0.50"],
    ["0.00", "S/ 0.00"],
    ["1234567.89", "S/ 1,234,567.89"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatSoles(input)).toBe(expected);
  });

  it("shows a dash for an absent amount", () => {
    expect(formatSoles(null)).toBe("—");
    expect(formatSoles(undefined)).toBe("—");
    expect(formatSoles("")).toBe("—");
  });

  it("pads a value that arrived with fewer decimals", () => {
    expect(formatSoles("1200")).toBe("S/ 1,200.00");
    expect(formatSoles("1200.5")).toBe("S/ 1,200.50");
  });

  /**
   * The reason this formatter manipulates strings instead of parsing:
   * 1234567.89 and 199.90 both lose their exact form through a double.
   */
  it("does not go through a float", () => {
    expect(formatSoles("199.90")).toBe("S/ 199.90");
    // Number("199.90").toFixed(2) happens to work; this one does not survive
    // a naive parse-and-multiply, which is what a cents-based helper would do.
    expect(formatSoles("10.07")).toBe("S/ 10.07");
    expect(formatSoles("1.10")).toBe("S/ 1.10");
  });
});

describe("formatDuration", () => {
  it("hides the buffer when there is none", () => {
    expect(formatDuration(45, 0)).toBe("45 min");
  });

  it("shows the cleaning time when there is one", () => {
    expect(formatDuration(45, 10)).toBe("45 min (+ 10 min limpieza)");
  });
});

describe("serviceSchema", () => {
  it("accepts a minimal single-session service", () => {
    expect(serviceSchema.safeParse(form()).success).toBe(true);
  });

  it("rejects SESSIONS with no packages at all", () => {
    const result = serviceSchema.safeParse(form({ structureType: "SESSIONS", packages: [] }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["packages"]);
  });

  it("rejects a package with no price", () => {
    const result = serviceSchema.safeParse(
      form({
        structureType: "SESSIONS",
        packages: [{ sessionCount: "6", frequencyDays: "", price: "" }],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("packages.0.price");
  });

  it("accepts a service with several packages", () => {
    const result = serviceSchema.safeParse(
      form({
        structureType: "SESSIONS",
        packages: [
          { sessionCount: "3", frequencyDays: "15", price: "400.00" },
          { sessionCount: "6", frequencyDays: "15", price: "720.00" },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("requires the valoración service when evaluation is on", () => {
    const result = serviceSchema.safeParse(form({ requiresEvaluation: true }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["evaluationServiceId"]);
  });

  it("requires an amount when the payment method is a deposit", () => {
    const result = serviceSchema.safeParse(form({ paymentMethods: ["DEPOSIT"] }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["depositAmount"]);
  });

  it("caps a percentage deposit at 100", () => {
    const result = serviceSchema.safeParse(
      form({ paymentMethods: ["DEPOSIT"], depositAmount: "120", depositIsPercentage: true }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("entre 1 y 100");
  });

  it("allows an amount above 100 when it is soles, not a percentage", () => {
    const result = serviceSchema.safeParse(
      form({ paymentMethods: ["DEPOSIT"], depositAmount: "120", depositIsPercentage: false }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a price with three decimals", () => {
    expect(serviceSchema.safeParse(form({ singlePrice: "10.129" })).success).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    expect(serviceSchema.safeParse(form({ singlePrice: "S/ 100" })).success).toBe(false);
  });

  it("rejects a duration of zero", () => {
    expect(serviceSchema.safeParse(form({ durationMinutes: "0" })).success).toBe(false);
  });

  it("rejects a package of a single session", () => {
    const result = serviceSchema.safeParse(
      form({
        structureType: "SESSIONS",
        packages: [{ sessionCount: "1", frequencyDays: "", price: "100.00" }],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("toServicePayload", () => {
  it("converts money to numbers only at the boundary", () => {
    const payload = toServicePayload(form({ singlePrice: "1200.00" }));
    expect(payload.singlePrice).toBe(1200);
    expect(typeof payload.singlePrice).toBe("number");
  });

  it("accepts a comma as the decimal separator", () => {
    expect(toServicePayload(form({ singlePrice: "199,90" })).singlePrice).toBe(199.9);
  });

  /**
   * The API runs with forbidNonWhitelisted and rejects an empty string in a
   * numeric field, so unused fields must be omitted rather than blanked.
   */
  it("omits packages for a single-session service", () => {
    const payload = toServicePayload(
      form({
        structureType: "SINGLE",
        packages: [{ sessionCount: "6", frequencyDays: "", price: "600.00" }],
      }),
    );
    expect(payload.packages).toBeUndefined();
  });

  it("sends every package, converted to numbers, for a SESSIONS service", () => {
    const payload = toServicePayload(
      form({
        structureType: "SESSIONS",
        packages: [
          { sessionCount: "3", frequencyDays: "15", price: "400.00" },
          { sessionCount: "6", frequencyDays: "", price: "720.00" },
        ],
      }),
    );
    expect(payload.packages).toEqual([
      { sessionCount: 3, frequencyDays: 15, price: 400 },
      { sessionCount: 6, frequencyDays: undefined, price: 720 },
    ]);
  });

  it("omits deposit fields when the payment is not a deposit", () => {
    const payload = toServicePayload(
      form({ paymentMethods: ["IN_PERSON"], depositAmount: "30", depositIsPercentage: true }),
    );
    expect(payload.depositAmount).toBeUndefined();
    expect(payload.depositIsPercentage).toBe(false);
  });

  it("omits evaluation fields when no evaluation is required", () => {
    const payload = toServicePayload(
      form({
        requiresEvaluation: false,
        evaluationServiceId: EVALUATION_ID,
        evaluationCost: "80.00",
        isEvaluationDeductible: true,
        deductibleExpirationDays: "30",
      }),
    );
    expect(payload.evaluationServiceId).toBeUndefined();
    expect(payload.evaluationCost).toBeUndefined();
    expect(payload.isEvaluationDeductible).toBe(false);
    expect(payload.deductibleExpirationDays).toBeUndefined();
  });

  it("keeps the deductible expiry only while the discount is deductible", () => {
    const payload = toServicePayload(
      form({
        requiresEvaluation: true,
        evaluationServiceId: EVALUATION_ID,
        isEvaluationDeductible: false,
        deductibleExpirationDays: "30",
      }),
    );
    expect(payload.deductibleExpirationDays).toBeUndefined();
  });

  it("defaults the buffer to 0 rather than sending an empty string", () => {
    expect(toServicePayload(form({ bufferMinutes: "" })).bufferMinutes).toBe(0);
  });

  it("trims text fields", () => {
    const payload = toServicePayload(form({ name: "  Facial  " }));
    expect(payload.name).toBe("Facial");
  });
});

describe("toServiceForm", () => {
  const service: Service = {
    id: "svc",
    tenantId: "t",
    categoryId: CATEGORY_ID,
    name: "Depilación láser",
    commercialDescription: "Paquete de 6 sesiones.",
    mainImageUrl: null,
    testimonioGallery: [],
    structureType: "SESSIONS",
    singlePrice: "199.90",
    packages: [
      { id: "pkg1", serviceId: "svc", sessionCount: 6, frequencyDays: 30, price: "999.99", createdAt: "2026-08-19T00:00:00.000Z" },
    ],
    requiresEvaluation: false,
    evaluationServiceId: null,
    evaluationCost: null,
    isEvaluationDeductible: false,
    deductibleExpirationDays: null,
    availabilityType: "GENERAL",
    customSchedule: null,
    durationMinutes: 45,
    bufferMinutes: 10,
    contraindications: ["EMBARAZO"],
    prePostCare: null,
    paymentMethods: ["IN_PERSON"],
    depositAmount: null,
    depositIsPercentage: false,
    isActive: true,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    category: { id: CATEGORY_ID, name: "Corporal", color: "#10B981" },
  };

  /**
   * The point of keeping money as a string all the way through: editing a
   * service and saving it again must not shave a digit off the price.
   */
  it("round-trips a price through edit without losing the cents", () => {
    const payload = toServicePayload(toServiceForm(service));
    expect(payload.singlePrice).toBe(199.9);
    expect(payload.packages).toEqual([{ sessionCount: 6, frequencyDays: 30, price: 999.99 }]);
    expect(toServiceForm(service).singlePrice).toBe("199.90");
  });

  it("produces values the schema accepts", () => {
    expect(serviceSchema.safeParse(toServiceForm(service)).success).toBe(true);
  });

  it("turns nulls into empty strings the inputs can bind to", () => {
    const values = toServiceForm(service);
    expect(values.mainImageUrl).toBe("");
    expect(values.prePostCare).toBe("");
    expect(values.evaluationServiceId).toBe("");
  });
});

describe("needsEvaluationLink", () => {
  const base = { requiresEvaluation: false, evaluationServiceId: null } as Service;

  it("flags an imported service that requires a valoración with none linked", () => {
    expect(needsEvaluationLink({ ...base, requiresEvaluation: true })).toBe(true);
  });

  it("does not flag one that has the link", () => {
    expect(
      needsEvaluationLink({
        ...base,
        requiresEvaluation: true,
        evaluationServiceId: EVALUATION_ID,
      }),
    ).toBe(false);
  });

  it("does not flag a service that needs no valoración", () => {
    expect(needsEvaluationLink(base)).toBe(false);
  });
});
