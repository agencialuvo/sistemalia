import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

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
  // would silently drop them on /dashboard.
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
      url.pathname = '/dashboard'
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

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings']
  const onboardingPath = '/onboarding'
  if (!user && !hasNestJsSession && [...protectedPaths, onboardingPath].some(path => request.nextUrl.pathname.startsWith(path))) {
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
  // NOTE: this gate only runs for Supabase-authenticated users (`user`).
  // A NestJS-only session (hasNestJsSession, no Supabase `user`) is let
  // through above but skips this gate entirely — get_my_tenant_id() is a
  // Supabase RPC with nothing to check on the NestJS side yet. Módulo 02
  // (Tenant Onboarding) needs to add the equivalent gate for NestJS
  // sessions once tenants exist in Prisma.
  const isOnProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))
  const isOnOnboardingPath = request.nextUrl.pathname.startsWith(onboardingPath)
  if (user && (isOnProtectedPath || isOnOnboardingPath)) {
    const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
    if (!tenantId && isOnProtectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = onboardingPath
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
    if (tenantId && isOnOnboardingPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  // API routes that need auth (not webhooks)
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
