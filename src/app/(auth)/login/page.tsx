"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, getApiErrorMessage } from "@/lib/api";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    try {
      await api.post("/auth/login", data);
      router.push("/onboarding");
    } catch (error) {
      setServerError(getApiErrorMessage(error, "No se pudo iniciar sesión."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local SVG wordmark, next/image's optimizer requires dangerouslyAllowSVG for no benefit here */}
          <img
            src="/SISTEMA%20LIA.svg"
            alt="Sistema LIA"
            className="mb-3 h-12 w-auto max-w-[220px] sm:h-14"
          />
          <CardTitle className="text-xl text-foreground">Bienvenido de nuevo</CardTitle>
          <CardDescription className="text-muted-foreground">
            Inicia sesión en tu cuenta de Sistema LIA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            onClick={() => {
              window.location.href = `${API_URL}/auth/google`;
            }}
          >
            Continuar con Google
          </Button>

          <div className="my-4 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">o</span>
            <Separator className="flex-1" />
          </div>

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

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-muted-foreground">
                  Contraseña
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <PasswordInput id="password" {...register("password")} />
              {errors.password && (
                <p className="text-sm text-red-400">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-primary hover:text-primary/80">
              Crea una cuenta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
