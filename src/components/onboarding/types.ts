export interface OnboardingData {
  // Paso 1 — Identidad del negocio y perfil fiscal
  identity_type: 'empresa' | 'marca_personal' | '';
  tax_id_type: 'RUC10' | 'RUC20' | '';
  tax_id: string;
  legal_name: string;
  commercial_name: string;

  // Paso 2 — Primera sede
  branch_name: string;
  address: string;
  region_code: string;
  province_code: string;
  district_code: string;
  whatsapp_number: string;

  // Paso 3 — Identidad visual y especialidad
  logo_url: string | null;
  main_category:
    | 'medicina_estetica'
    | 'cosmetologia_spa'
    | 'cejas_pestanas'
    | 'salon_belleza'
    | '';
}

// "Sede Principal" is the literal default value the spec asks for
// (business data the user sees pre-filled), not app chrome — it
// stays as-is regardless of UI locale, same as an editable placeholder
// business name would.
export const EMPTY_ONBOARDING_DATA: OnboardingData = {
  identity_type: '',
  tax_id_type: '',
  tax_id: '',
  legal_name: '',
  commercial_name: '',
  branch_name: 'Sede Principal',
  address: '',
  region_code: '',
  province_code: '',
  district_code: '',
  whatsapp_number: '',
  logo_url: null,
  main_category: '',
};

export function isStep1Valid(d: OnboardingData): boolean {
  return (
    (d.identity_type === 'empresa' || d.identity_type === 'marca_personal') &&
    (d.tax_id_type === 'RUC10' || d.tax_id_type === 'RUC20') &&
    /^\d{11}$/.test(d.tax_id) &&
    d.legal_name.trim().length > 0 &&
    d.commercial_name.trim().length > 0
  );
}

export function isStep2Valid(d: OnboardingData): boolean {
  return (
    d.branch_name.trim().length > 0 &&
    d.address.trim().length > 0 &&
    d.district_code.length === 6 &&
    /^\d{9}$/.test(d.whatsapp_number)
  );
}

export function isStep3Valid(d: OnboardingData): boolean {
  return (
    d.main_category === 'medicina_estetica' ||
    d.main_category === 'cosmetologia_spa' ||
    d.main_category === 'cejas_pestanas' ||
    d.main_category === 'salon_belleza'
  );
}
