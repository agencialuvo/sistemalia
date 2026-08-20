import type {
  SpecialtyCategory,
  TaxIdType,
  TenantIdentityType,
  TenantOnboardingInput,
} from "@/lib/validators/tenant";

// Draft state for the 3-step wizard (Historia 2). Shaped after the NestJS
// payload (see CreateTenantDto) rather than after the form layout, so
// "finalizar" is a near-straight serialisation instead of a mapping step that
// can drift from the API.
//
// Two differences from the payload, both deliberate:
//   - enums carry "" as the "not chosen yet" state, because a half-filled draft
//     is the normal condition of a wizard;
//   - the branch carries regionCode/provinceCode, which the API does NOT accept.
//     They are the cascade position of the Ubigeo selectors and are stripped by
//     toOnboardingPayload().

/** A row of the 7-day matrix. "" for a break bound means "no break that day". */
export interface WorkingHourDraft {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string;
  breakEnd: string;
}

export interface BranchDraft {
  name: string;
  address: string;
  /** UI-only: parent of the province selector. Never sent to the API. */
  regionCode: string;
  /** UI-only: parent of the district selector. Never sent to the API. */
  provinceCode: string;
  /** The district code — this is the real `ubigeoCode` the API stores. */
  ubigeoCode: string;
  whatsappNumber: string;
  defaultAppointmentMinutes: 30 | 45 | 60 | 90;
  workingHours: WorkingHourDraft[];
}

export interface OnboardingDraft {
  identityType: TenantIdentityType | "";
  taxIdType: TaxIdType | "";
  taxId: string;
  legalName: string;
  fiscalAddress: string;
  commercialName: string;
  branch: BranchDraft;
  specialty: SpecialtyCategory | "";
  logoUrl: string | null;
}

/**
 * Display order of the matrix: Lunes first, as the spec's day selector reads
 * (Paso 2), even though the stored `dayOfWeek` is 0-based from Domingo to match
 * JS `Date.getDay()` and the BranchWorkingHour column.
 */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const DAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/** Mon–Fri open 09:00–19:00, weekend closed — the common case, pre-filled. */
function defaultWorkingHours(): WorkingHourDraft[] {
  return DAY_ORDER.map((dayOfWeek) => ({
    dayOfWeek,
    isOpen: dayOfWeek !== 0 && dayOfWeek !== 6,
    openTime: "09:00",
    closeTime: "19:00",
    breakStart: "",
    breakEnd: "",
  }));
}

// "Sede Principal" is the literal default the spec asks for (business data the
// user sees pre-filled), not app chrome — it stays in Spanish regardless of UI
// locale, same as an editable placeholder business name would.
export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  identityType: "",
  taxIdType: "",
  taxId: "",
  legalName: "",
  fiscalAddress: "",
  commercialName: "",
  branch: {
    name: "Sede Principal",
    address: "",
    regionCode: "",
    provinceCode: "",
    ubigeoCode: "",
    whatsappNumber: "+51",
    defaultAppointmentMinutes: 60,
    workingHours: defaultWorkingHours(),
  },
  specialty: "",
  logoUrl: null,
};

/**
 * Serialises the draft into the exact body POST /tenant/onboarding expects.
 *
 * Drops the UI-only cascade fields and turns "" into `undefined` for every
 * optional: the backend validates with `forbidNonWhitelisted`, so an extra
 * `regionCode` key is a 400, and an empty-string `breakStart` fails the HH:mm
 * pattern instead of reading as "no break".
 *
 * Returns `unknown`-free but unvalidated data by design — the caller runs it
 * through tenantOnboardingSchema before sending.
 */
export function toOnboardingPayload(draft: OnboardingDraft): TenantOnboardingInput {
  return {
    identityType: draft.identityType as TenantOnboardingInput["identityType"],
    taxIdType: draft.taxIdType as TenantOnboardingInput["taxIdType"],
    taxId: draft.taxId.trim(),
    legalName: draft.legalName.trim(),
    fiscalAddress: draft.fiscalAddress.trim() || undefined,
    commercialName: draft.commercialName.trim(),
    specialty: draft.specialty as TenantOnboardingInput["specialty"],
    logoUrl: draft.logoUrl ?? undefined,
    branch: {
      name: draft.branch.name.trim(),
      address: draft.branch.address.trim(),
      ubigeoCode: draft.branch.ubigeoCode,
      whatsappNumber: draft.branch.whatsappNumber.replace(/\s+/g, ""),
      defaultAppointmentMinutes: draft.branch.defaultAppointmentMinutes,
      workingHours: draft.branch.workingHours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        isOpen: hour.isOpen,
        openTime: hour.openTime,
        closeTime: hour.closeTime,
        breakStart: hour.breakStart || undefined,
        breakEnd: hour.breakEnd || undefined,
      })),
    },
  };
}
