// ============================================================
// /onboarding layout — Historia 2 (Configuración inicial del
// Centro Estético). Sits outside both `(auth)` and `(dashboard)`
// for the same reason `/join/[token]` does: it must render for a
// signed-in user who has NOT finished business onboarding yet.
// Reusing `(dashboard)`'s layout would mount the full sidebar/shell
// (which assumes a tenant already exists); reusing `(auth)` would
// funnel the user back through the "already logged in" redirect.
//
// Wider than the auth/join card shells (max-w-2xl vs max-w-md) —
// this is a 3-step form wizard, not a single action.
// ============================================================

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}
