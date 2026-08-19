"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OtpInput } from "@/components/auth/otp-input";
import { api, getApiErrorMessage } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 60;
const LOCKOUT_MESSAGE = "Demasiados intentos fallidos. Solicita un nuevo código.";

// useSearchParams needs a Suspense boundary to avoid opting the page out
// of static prerendering — same pattern as (auth)/login/page.tsx.
export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpPageInner />
    </Suspense>
  );
}

function VerifyOtpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleVerify() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/verify-otp", { email, code });
      router.push("/onboarding");
    } catch (err) {
      const message = getApiErrorMessage(err, "El código ingresado es inválido o ha expirado.");
      setError(message);
      if (message === LOCKOUT_MESSAGE) {
        setLocked(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      await api.post("/auth/resend-otp", { email });
      setLocked(false);
      setCode("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo reenviar el código."));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">Verifica tu cuenta</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ingresa el código de 6 dígitos que enviamos a {email || "tu correo"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            {error && (
              <div className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
                {error}
              </div>
            )}

            <OtpInput value={code} onChange={setCode} disabled={locked || submitting} />

            <Button
              type="button"
              onClick={handleVerify}
              disabled={locked || submitting || code.length !== 6}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Verificando..." : "Verificar código"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              className="h-10 w-full"
            >
              {resending
                ? "Reenviando..."
                : resendCooldown > 0
                  ? `Reenviar código (${resendCooldown}s)`
                  : "Reenviar código"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
