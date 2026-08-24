"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, getApiErrorMessage } from "@/lib/api";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validators/auth";

// useSearchParams needs a Suspense boundary — same pattern as
// (auth)/login/page.tsx and (auth)/verify-otp/page.tsx.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: "" },
  });

  async function onSubmit(data: ResetPasswordInput) {
    setServerError(null);
    try {
      await api.post("/auth/reset-password", data);
      router.push("/login?reset=success");
    } catch (error) {
      setServerError(getApiErrorMessage(error, "No se pudo restablecer la contraseña."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">Nueva contraseña</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ingresa tu nueva contraseña para tu cuenta de Sistema LIA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-400">
              Este enlace no incluye un token de restablecimiento válido.
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {serverError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {serverError}
                </div>
              )}

              <input type="hidden" {...register("token")} />

              <div className="flex flex-col gap-2">
                <Label htmlFor="newPassword" className="text-muted-foreground">
                  Nueva contraseña
                </Label>
                <PasswordInput id="newPassword" {...register("newPassword")} />
                {errors.newPassword && (
                  <p className="text-sm text-red-400">{errors.newPassword.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? "Actualizando..." : "Actualizar contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
