import { NextResponse } from 'next/server'
import { Region, Province } from 'ubigeos'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// Cascading Ubigeo lookups for Historia 2 / Paso 2 (Departamento →
// Provincia → Distrito). Backed by the `ubigeos` npm package (INEI/
// SUNAT-derived, MIT-licensed) rather than a hand-maintained table —
// full Peru coverage is ~1,874 districts, too large to keep in sync
// by hand. Server-only: the package's raw dataset isn't shipped to
// the client, only the small slice a given request asks for.
//
// Auth-gated (any account member) rather than public — this data has
// no need to be scraped anonymously, and gating it for free avoids
// giving this route its own rate-limit story.

const REGION_CODES = Array.from({ length: 25 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
)

export async function GET(request: Request) {
  try {
    await getCurrentAccount()
  } catch (err) {
    return toErrorResponse(err)
  }

  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')

  if (level === 'regions') {
    const regions = REGION_CODES.map((code) => {
      const region = Region.instance(code)
      return { code: region.getCode(), name: region.getName() }
    })
    return NextResponse.json({ regions })
  }

  if (level === 'provinces') {
    const regionCode = searchParams.get('region')
    if (!regionCode) {
      return NextResponse.json({ error: 'region is required' }, { status: 400 })
    }
    try {
      const region = Region.instance(regionCode)
      const provinces = region
        .getProvincies()
        .map((p) => ({ code: p.getCode(), name: p.getName() }))
      return NextResponse.json({ provinces })
    } catch {
      return NextResponse.json({ error: 'Unknown region code' }, { status: 404 })
    }
  }

  if (level === 'districts') {
    const provinceCode = searchParams.get('province')
    if (!provinceCode) {
      return NextResponse.json({ error: 'province is required' }, { status: 400 })
    }
    try {
      const province = Province.instance(provinceCode)
      const districts = province
        .getDistricts()
        .map((d) => ({ code: d.getCode(), name: d.getName() }))
      return NextResponse.json({ districts })
    } catch {
      return NextResponse.json({ error: 'Unknown province code' }, { status: 404 })
    }
  }

  return NextResponse.json(
    { error: "level must be one of 'regions', 'provinces', 'districts'" },
    { status: 400 },
  )
}
