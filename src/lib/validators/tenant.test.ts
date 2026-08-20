import { describe, expect, it } from "vitest";

import {
  isValidRuc,
  step1Schema,
  step2Schema,
  step3Schema,
  tenantOnboardingSchema,
  validateLogoFile,
} from "./tenant";

const validStep1 = {
  identityType: "EMPRESA",
  taxIdType: "RUC20",
  taxId: "20131312955",
  legalName: "CENTRO ESTETICO LIA S.A.C.",
  fiscalAddress: "AV. LARCO 123 - MIRAFLORES",
  commercialName: "Clínica LIA",
};

const openDay = (dayOfWeek: number, extra: Record<string, unknown> = {}) => ({
  dayOfWeek,
  isOpen: true,
  openTime: "09:00",
  closeTime: "19:00",
  ...extra,
});

const validStep2 = {
  name: "Sede Principal",
  address: "Av. Larco 123",
  ubigeoCode: "150122",
  whatsappNumber: "+51987654321",
  defaultAppointmentMinutes: 60,
  workingHours: [1, 2, 3, 4, 5].map((d) => openDay(d)),
};

const validStep3 = { specialty: "MEDICINA_ESTETICA" };

describe("isValidRuc (Módulo 11)", () => {
  // Real, publicly listed RUCs. For each, exactly one check digit may be
  // accepted and it must be the published one — this pins the algorithm
  // without depending on a hand-written fixture being correct.
  it.each([
    ["20131312955", "SUNAT"],
    ["20100070970", "Banco de Crédito del Perú"],
    ["20100047218", "Alicorp"],
    ["20100128056", "Backus"],
  ])("accepts only the real check digit of %s (%s)", (ruc) => {
    const accepted = [...Array(10).keys()].filter((d) => isValidRuc(ruc.slice(0, 10) + d));
    expect(accepted).toEqual([Number(ruc[10])]);
  });

  it("accepts a RUC 10 prefix (persona natural con negocio)", () => {
    expect(isValidRuc("10425252840")).toBe(true);
  });

  it.each([
    ["20131312954", "wrong check digit"],
    ["20131312", "too short"],
    ["201313129551", "too long"],
    ["30131312955", "prefix SUNAT does not issue"],
    ["2013131295a", "contains a letter"],
    ["", "empty"],
  ])("rejects %s (%s)", (ruc) => {
    expect(isValidRuc(ruc)).toBe(false);
  });
});

describe("step1Schema", () => {
  it("accepts a complete identity", () => {
    expect(step1Schema.safeParse(validStep1).success).toBe(true);
  });

  it("treats fiscalAddress as optional (SUNAT may be unreachable)", () => {
    const { fiscalAddress: _omitted, ...withoutAddress } = validStep1;
    expect(step1Schema.safeParse(withoutAddress).success).toBe(true);
  });

  it.each([
    ["identityType", "OTRO"],
    ["taxIdType", "RUC30"],
    ["taxId", "20131312954"],
    ["legalName", ""],
    ["commercialName", "X"],
  ])("rejects an invalid %s", (field, value) => {
    const result = step1Schema.safeParse({ ...validStep1, [field]: value });
    expect(result.success).toBe(false);
  });
});

describe("step2Schema", () => {
  it("accepts a complete branch", () => {
    expect(step2Schema.safeParse(validStep2).success).toBe(true);
  });

  it.each([
    ["ubigeoCode", "15012", "5-digit ubigeo"],
    ["whatsappNumber", "987654321", "no country code"],
    ["defaultAppointmentMinutes", 25, "unsupported slot length"],
    ["address", "", "empty address"],
  ])("rejects %s = %s (%s)", (field, value, _label) => {
    expect(step2Schema.safeParse({ ...validStep2, [field]: value }).success).toBe(false);
  });

  it("rejects a week with no open day", () => {
    const closed = validStep2.workingHours.map((h) => ({ ...h, isOpen: false }));
    expect(step2Schema.safeParse({ ...validStep2, workingHours: closed }).success).toBe(false);
  });

  it("rejects duplicated days (corrupted draft)", () => {
    const dupes = [openDay(1), openDay(1)];
    expect(step2Schema.safeParse({ ...validStep2, workingHours: dupes }).success).toBe(false);
  });

  it("rejects a close time before the open time", () => {
    const inverted = [openDay(1, { openTime: "19:00", closeTime: "09:00" })];
    const result = step2Schema.safeParse({ ...validStep2, workingHours: inverted });
    expect(result.success).toBe(false);
  });

  it("accepts a break inside the opening hours", () => {
    const withBreak = [openDay(1, { breakStart: "13:00", breakEnd: "14:00" })];
    expect(step2Schema.safeParse({ ...validStep2, workingHours: withBreak }).success).toBe(true);
  });

  it.each([
    [{ breakStart: "13:00" }, "break with no end"],
    [{ breakStart: "14:00", breakEnd: "13:00" }, "inverted break"],
    [{ breakStart: "20:00", breakEnd: "21:00" }, "break outside opening hours"],
  ])("rejects %o (%s)", (extra, _label) => {
    const hours = [openDay(1, extra)];
    expect(step2Schema.safeParse({ ...validStep2, workingHours: hours }).success).toBe(false);
  });

  it("ignores time ordering on a closed day", () => {
    // A closed day carries whatever placeholder times the form last held; they
    // must not block submission.
    const hours = [openDay(1), { ...openDay(0, { openTime: "19:00", closeTime: "09:00" }), isOpen: false }];
    expect(step2Schema.safeParse({ ...validStep2, workingHours: hours }).success).toBe(true);
  });
});

describe("step3Schema", () => {
  it("accepts every specialty the backend enum defines", () => {
    for (const specialty of [
      "MEDICINA_ESTETICA",
      "COSMETOLOGIA_SPA",
      "CEJAS_PESTANAS",
      "SALON_BELLEZA",
      "DERMATOLOGIA",
    ]) {
      expect(step3Schema.safeParse({ specialty }).success).toBe(true);
    }
  });

  it("treats the logo as optional", () => {
    expect(step3Schema.safeParse(validStep3).success).toBe(true);
  });

  it("rejects an unknown specialty", () => {
    expect(step3Schema.safeParse({ specialty: "PODOLOGIA" }).success).toBe(false);
  });
});

describe("tenantOnboardingSchema", () => {
  it("accepts the consolidated payload", () => {
    const result = tenantOnboardingSchema.safeParse({
      ...validStep1,
      ...validStep3,
      branch: validStep2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with no branch", () => {
    const result = tenantOnboardingSchema.safeParse({ ...validStep1, ...validStep3 });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys so forbidNonWhitelisted cannot 400 on them", () => {
    const result = tenantOnboardingSchema.safeParse({
      ...validStep1,
      ...validStep3,
      branch: { ...validStep2, regionCode: "15", provinceCode: "1501" },
      somethingElse: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("somethingElse");
      expect(result.data.branch).not.toHaveProperty("regionCode");
      expect(result.data.branch).not.toHaveProperty("provinceCode");
    }
  });
});

describe("validateLogoFile", () => {
  const file = (type: string, size: number) =>
    ({ type, size, name: "logo" }) as File;

  it.each(["image/png", "image/jpeg", "image/webp"])("accepts %s under 5MB", (type) => {
    expect(validateLogoFile(file(type, 1024))).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf"])("rejects %s", (type) => {
    expect(validateLogoFile(file(type, 1024))).not.toBeNull();
  });

  it("rejects a file over 5MB", () => {
    expect(validateLogoFile(file("image/png", 5 * 1024 * 1024 + 1))).not.toBeNull();
  });
});
