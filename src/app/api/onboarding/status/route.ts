import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// Historia 2 §1 — "Restricción de Acceso Global": the middleware and
// the onboarding wizard itself both need a cheap way to ask "has this
// account already provisioned its tenant?" `get_my_tenant_id()`
// (migration 037) does the profiles → tenants join server-side in one
// round trip.

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data: tenantId, error } = await supabase.rpc('get_my_tenant_id')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ tenantId: tenantId ?? null })
  } catch (err) {
    return toErrorResponse(err)
  }
}
