import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton instance — one client shared across the whole browser session.
// Creating multiple clients causes auth-lock contention ("Lock was released
// because another request stole it") and intermittent fetch failures.
let browserClient: SupabaseClient | undefined

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Whether this deployment has Supabase credentials at all.
 *
 * Sistema LIA authenticates against the NestJS API in backend/; Supabase is the
 * legacy wacrm path and is optional. Components that can offer something better
 * than an empty state when it is absent should branch on this.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let warned = false

function warnOnce() {
  if (warned) return
  warned = true
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Supabase-backed features (legacy wacrm modules) will render empty. ' +
      'Sistema LIA auth and onboarding run on the NestJS API and are unaffected.',
  )
}

/**
 * Result every stubbed query settles to. `data` shape follows what the caller
 * asked for: a point lookup (`.single()` / `.maybeSingle()`) expects an object
 * or null, everything else expects a list.
 */
function emptyResult(single: boolean) {
  return { data: single ? null : [], error: null, count: 0, status: 200, statusText: 'OK' }
}

/**
 * A no-op stand-in for the Supabase client, used when no credentials are
 * configured.
 *
 * Why a stub and not `null`: 43 modules inherited from wacrm call
 * `createClient()` unconditionally and chain straight into
 * `.from(...).select(...)`. Returning null turns one missing env var into a
 * `TypeError` on every dashboard route — which is exactly the crash this
 * replaces. Returning a stub degrades those screens to empty states while the
 * NestJS-backed parts of the app keep working.
 *
 * It is built on a Proxy because the query builder is open-ended: any method
 * chain (`.eq().order().limit().range()`) has to keep returning something
 * chainable, and the builder is also awaitable at any point. The proxy is
 * therefore both a function and a thenable.
 */
function createStubClient(): SupabaseClient {
  warnOnce()

  const makeBuilder = (single = false): unknown => {
    const target = function () {} as unknown as Record<string | symbol, unknown>

    return new Proxy(target, {
      get(_t, prop) {
        // Awaiting the builder resolves the query.
        if (prop === 'then') {
          const result = emptyResult(single)
          return (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
        }
        if (prop === 'catch' || prop === 'finally') {
          return () => makeBuilder(single)
        }
        // `.single()` / `.maybeSingle()` switch the expected shape from list to
        // object for the rest of the chain.
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => makeBuilder(true)
        }
        // Realtime: `.subscribe()` must hand back something `removeChannel`
        // and `unsubscribe` can be called on.
        if (prop === 'subscribe') {
          return () => makeBuilder(single)
        }
        if (prop === 'unsubscribe') {
          return () => Promise.resolve('ok')
        }
        return () => makeBuilder(single)
      },
      apply() {
        return makeBuilder(single)
      },
    })
  }

  const auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signOut: async () => ({ error: null }),
    // Callers keep the returned subscription and unsubscribe on unmount.
    onAuthStateChange: () => ({
      data: { subscription: { id: 'stub', callback: () => {}, unsubscribe: () => {} } },
    }),
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: { message: 'Supabase no está configurado.' },
    }),
    signInWithOAuth: async () => ({
      data: { provider: null, url: null },
      error: { message: 'Supabase no está configurado.' },
    }),
  }

  const stub = new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, prop) {
      if (prop === 'auth') return auth
      if (prop === 'removeChannel' || prop === 'removeAllChannels') {
        return () => Promise.resolve('ok')
      }
      return makeBuilder()
    },
  })

  return stub as unknown as SupabaseClient
}

export function createClient() {
  if (browserClient) return browserClient

  browserClient =
    SUPABASE_URL && SUPABASE_ANON_KEY
      ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : createStubClient()

  return browserClient
}
