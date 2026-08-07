import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

// Historia 2 / Paso 3 "Finalizar Registro" — provisions the tenant +
// first branch in one request. Runs under the caller's own RLS-scoped
// client (no service role needed): `tenants_insert` / `branches_modify`
// already require `admin`+, and `requireRole('admin')` below enforces
// the same floor before we even try, so failures come back as a clean
// 403 instead of an opaque RLS-denied 42501.
//
// Catalog/consent-template pre-load (spec §2 Paso 3 step 4) is
// intentionally NOT done here — those tables don't exist yet
// (deferred to a later increment, confirmed with product 2026-08-07).

const IDENTITY_TYPES = ['empresa', 'marca_personal'] as const
const TAX_ID_TYPES = ['RUC10', 'RUC20'] as const
const MAIN_CATEGORIES = [
  'medicina_estetica',
  'cosmetologia_spa',
  'cejas_pestanas',
  'salon_belleza',
] as const

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ---- Paso 1: identidad y perfil fiscal ----
  const identity_type = body.identity_type
  const tax_id_type = body.tax_id_type
  const tax_id = typeof body.tax_id === 'string' ? body.tax_id.trim() : ''
  const legal_name = typeof body.legal_name === 'string' ? body.legal_name.trim() : ''
  const commercial_name =
    typeof body.commercial_name === 'string' ? body.commercial_name.trim() : ''
  const main_category = body.main_category

  // ---- Paso 2: primera sede ----
  const branch_name =
    typeof body.branch_name === 'string' && body.branch_name.trim()
      ? body.branch_name.trim()
      : 'Sede Principal'
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  const ubigeo_code = typeof body.ubigeo_code === 'string' ? body.ubigeo_code.trim() : ''
  const whatsapp_number =
    typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : ''

  // ---- Paso 3: identidad visual ----
  const logo_url = typeof body.logo_url === 'string' && body.logo_url ? body.logo_url : null

  const errors: Record<string, string> = {}
  if (!isOneOf(identity_type, IDENTITY_TYPES)) errors.identity_type = 'invalid'
  if (!isOneOf(tax_id_type, TAX_ID_TYPES)) errors.tax_id_type = 'invalid'
  if (!/^\d{11}$/.test(tax_id)) errors.tax_id = 'must be exactly 11 digits'
  if (!legal_name) errors.legal_name = 'required'
  if (!commercial_name) errors.commercial_name = 'required'
  if (!isOneOf(main_category, MAIN_CATEGORIES)) errors.main_category = 'invalid'
  if (!address) errors.address = 'required'
  if (!/^\d{6}$/.test(ubigeo_code)) errors.ubigeo_code = 'must be exactly 6 digits'
  if (!/^\d{9}$/.test(whatsapp_number)) errors.whatsapp_number = 'must be exactly 9 digits'

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Validation failed', fields: errors }, { status: 400 })
  }

  // One tenant per account (Historia 2 scope) — surface a clean 409
  // instead of letting the UNIQUE(account_id) constraint bubble up as
  // a raw Postgres error.
  const { data: existing } = await ctx.supabase
    .from('tenants')
    .select('id')
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'This account has already completed business onboarding', tenantId: existing.id },
      { status: 409 },
    )
  }

  const { data: tenant, error: tenantErr } = await ctx.supabase
    .from('tenants')
    .insert({
      account_id: ctx.accountId,
      owner_id: ctx.userId,
      identity_type,
      tax_id_type,
      tax_id,
      legal_name,
      commercial_name,
      main_category,
      logo_url,
    })
    .select('id')
    .single()

  if (tenantErr || !tenant) {
    return NextResponse.json(
      { error: tenantErr?.message ?? 'Failed to create tenant' },
      { status: 500 },
    )
  }

  const { data: branch, error: branchErr } = await ctx.supabase
    .from('branches')
    .insert({
      tenant_id: tenant.id,
      name: branch_name,
      address,
      ubigeo_code,
      whatsapp_number,
    })
    .select('id')
    .single()

  if (branchErr || !branch) {
    // Best-effort cleanup so a failed Paso 2 write doesn't leave a
    // half-provisioned tenant the resume-onboarding check would treat
    // as "done". Branch insert failing here is expected to be rare
    // (same transa/account, constraints already validated above).
    await ctx.supabase.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json(
      { error: branchErr?.message ?? 'Failed to create branch' },
      { status: 500 },
    )
  }

  return NextResponse.json({ tenantId: tenant.id, branchId: branch.id }, { status: 201 })
}
