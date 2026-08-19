import type { Metadata } from "next";
import type { ReactNode } from "react";

// Shared metadata for auth pages: login, register, verify-otp,
// forgot-password, reset-password (Sistema LIA / NestJS backend/) plus
// the legacy signup (still Supabase). None of these should be indexed —
// they'd compete with the marketing landing in SERPs and offer nothing
// to a searcher who hasn't already signed up. Each page still gets its
// own <title> via its own metadata.title override below the route
// group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
