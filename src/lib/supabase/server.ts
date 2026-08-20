import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client, used by the legacy wacrm API routes.
 *
 * Unlike the browser client — which degrades to a no-op stub so dashboard
 * screens render empty instead of crashing — this one fails loudly. Its callers
 * are route handlers: returning fake empty data there would make a
 * misconfiguration look like "no records", which is far harder to diagnose than
 * a 500 that names the missing variables.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL y/o ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY. Esta ruta pertenece a los módulos heredados ' +
        'de wacrm; la autenticación y el onboarding de Sistema LIA usan la API NestJS.',
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}
