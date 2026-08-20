import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const NESTJS_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

/**
 * Budget for the membership lookup. The gate sits in front of every dashboard
 * navigation, so a hung API must not hold the page hostage — past this the
 * answer is treated as unknown and the request is let through.
 */
const ONBOARDING_CHECK_TIMEOUT_MS = 2000

type OnboardingStatus = 'complete' | 'pending' | 'unknown'

interface TenantMembership {
  id: string
  onboardingCompletedAt: string | null
}

/**
 * Asks the NestJS API whether the caller already provisioned a centro estético
 * (Task 3.6 / spec §1 "Restricción de Acceso Global").
 *
 * There is no tenant claim inside the access token — membership lives in the
 * TenantUser table and can change without the token being reissued — so this
 * costs one round-trip per protected navigation. It forwards the incoming
 * Cookie header verbatim, which is what carries `access_token`.
 *
 * Returns 'unknown' for anything that is not a definitive answer; the caller
 * treats that as "let through" (see the call site for why failing open is the
 * only safe direction here).
 */
async function fetchNestJsOnboardingStatus(request: NextRequest): Promise<OnboardingStatus> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return 'unknown'

  try {
    const response = await fetch(`${NESTJS_API_URL}/tenant/me`, {
      headers: { cookie, accept: 'application/json' },
      // The answer is per-user and changes the moment onboarding finishes.
      cache: 'no-store',
      signal: AbortSignal.timeout(ONBOARDING_CHECK_TIMEOUT_MS),
    })

    if (!response.ok) return 'unknown'

    const memberships = (await response.json()) as TenantMembership[]
    if (!Array.isArray(memberships)) return 'unknown'

    // A membership whose tenant never finished the wizard counts as pending:
    // the row can exist while onboardingCompletedAt is still null.
    return memberships.some((m) => m.onboardingCompletedAt !== null) ? 'complete' : 'pending'
  } catch {
    // Network failure, DNS, or the 2s timeout.
    return 'unknown'
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Supabase is the LEGACY auth path (inherited from wacrm) and is now
  // optional: Sistema LIA authenticates against the NestJS API in
  // backend/, so a dev environment without NEXT_PUBLIC_SUPABASE_URL /
  // NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local is a valid setup.
  // createServerClient() throws "Your project's URL and Key are
  // required" when either is missing, which crashed every request
  // (including `npm run dev`'s first page load). When the vars are
  // absent we skip the Supabase check entirely and fall back to the
  // NestJS cookie flow below.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase =
    supabaseUrl && supabaseAnonKey
      ? createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
              supabaseResponse = NextResponse.next({ request })
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              )
            },
          },
        })
      : null

  const user = supabase ? (await supabase.auth.getUser()).data.user : null

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /panel.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/panel'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Sistema LIA / NestJS session (backend/, see .specify/features/01-auth).
  // This is a PRESENCE check only, not signature/expiry verification —
  // the JWT itself is verified server-side by the NestJS API on every
  // request that actually needs the claims. Here it only decides whether
  // the middleware lets a request through to a protected page or bounces
  // it to /login, so a forged/expired cookie at worst reaches a page that
  // then fails to fetch data (no NestJS-authenticated action is granted
  // by this check alone). Coexists with the Supabase check above/below —
  // either session is enough to pass.
  const hasNestJsSession =
    request.cookies.has('access_token') || request.cookies.has('refresh_token')

  // Auth model: DENY BY DEFAULT.
  //
  // The app's screens are Spanish top-level slugs (/panel, /pacientes,
  // /reportes…) with no shared prefix, so an allowlist of protected paths would
  // have to name all 22 — and silently leave any new section public until
  // someone remembered to add it. Listing what is PUBLIC instead is a much
  // shorter list, it changes far less often, and the failure mode of forgetting
  // an entry is a redirect to /login rather than an exposed page.
  const publicPaths = [
    '/login',
    '/signup',
    '/register',
    '/verify-otp',
    '/forgot-password',
    '/reset-password',
    '/join', // /join/<invite-token>
  ]
  const onboardingPath = '/onboarding'
  const { pathname } = request.nextUrl

  const isPublicPath =
    pathname === '/' || publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  // API routes authenticate themselves and must never be answered with an HTML
  // redirect — a webhook receiving a 307 to /login would look like success.
  const isApiPath = pathname.startsWith('/api')
  const isOnOnboardingPath = pathname.startsWith(onboardingPath)
  // Everything that is not public and not an API route needs a session.
  const isOnProtectedPath = !isPublicPath && !isApiPath && !isOnOnboardingPath

  if (!user && !hasNestJsSession && (isOnProtectedPath || isOnOnboardingPath)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Historia 2 — business onboarding gate ("Restricción de Acceso
  // Global"). Only checked when it can change the outcome: a signed-in
  // user on a protected page (must have finished onboarding already)
  // or on /onboarding itself (must NOT have finished it — no
  // re-onboarding loops for an already-provisioned account).
  //
  // Two independent implementations because the app currently has two auth
  // backends: `user` is Supabase (legacy wacrm path, get_my_tenant_id RPC) and
  // `hasNestJsSession` is Sistema LIA (Prisma tenants, GET /tenant/me).
  if (supabase && user && (isOnProtectedPath || isOnOnboardingPath)) {
    const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
    if (!tenantId && isOnProtectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = onboardingPath
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
    if (tenantId && isOnOnboardingPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/panel'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  // Task 3.6 — the same gate for a NestJS-only session. Runs only when there
  // is no Supabase user, so an account holding both sessions is decided once,
  // by the branch above, instead of being bounced between two verdicts.
  if (!user && hasNestJsSession && (isOnProtectedPath || isOnOnboardingPath)) {
    const status = await fetchNestJsOnboardingStatus(request)

    // `unknown` covers an unreachable API, a 5xx, and an expired access token
    // (the client's axios interceptor refreshes and retries on its own). All
    // three fail OPEN: redirecting on an inconclusive answer would trap the
    // user in a loop, because /onboarding needs the very same API to render.
    if (status === 'pending' && isOnProtectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = onboardingPath
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
    if (status === 'complete' && isOnOnboardingPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/panel'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  // API routes that need auth (not webhooks).
  // Deliberately still gated on the Supabase `user` alone: these routes
  // are wacrm's WhatsApp handlers and read Supabase server-side, so a
  // NestJS-only session can't service them anyway. With Supabase
  // unconfigured they simply answer 401, which is the correct outcome.
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
