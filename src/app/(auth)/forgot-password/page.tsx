"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, getApiErrorMessage } from "@/lib/api";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validators/auth";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError(null);
    try {
      // Backend always returns the same generic message here regardless
      // of whether the email exists (anti-enumeration) — safe to render
      // directly.
      const { data: response } = await api.post<{ message: string }>(
        "/auth/forgot-password",
        data,
      );
      setMessage(response.message);
    } catch (error) {
      setServerError(getApiErrorMessage(error, "No se pudo procesar la solicitud."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">Recupera tu contraseña</CardTitle>
          <CardDescription className="text-muted-foreground">
            Te enviaremos instrucciones para restablecerla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {message ? (
            <div className="rounded-lg border border-border bg-muted px-4 py-3 text-center text-sm text-foreground">
              {message}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {serverError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {serverError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-muted-foreground">
                  Correo electrónico
                </Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? "Enviando..." : "Enviar instrucciones"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:text-primary/80">
              Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
