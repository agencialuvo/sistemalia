"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { UserRoundPlus } from "lucide-react";
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
import { getRecaptchaToken } from "@/lib/recaptcha";
import { registerFormSchema, type RegisterFormInput } from "@/lib/validators/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  async function onSubmit(data: RegisterFormInput) {
    setServerError(null);
    try {
      const recaptchaToken = await getRecaptchaToken("register");
      await api.post("/auth/register", { ...data, recaptchaToken });
      router.push(`/verify-otp?email=${encodeURIComponent(data.email)}`);
    } catch (error) {
      setServerError(getApiErrorMessage(error, "No se pudo completar el registro."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <UserRoundPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">Crea tu cuenta</CardTitle>
          <CardDescription className="text-muted-foreground">
            Regístrate para configurar tu Centro Estético en Sistema LIA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {serverError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {serverError}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName" className="text-muted-foreground">
                Nombre completo
              </Label>
              <Input id="fullName" type="text" {...register("fullName")} />
              {errors.fullName && (
                <p className="text-sm text-red-400">{errors.fullName.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                Correo electrónico
              </Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-muted-foreground">
                Contraseña
              </Label>
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
              {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary hover:text-primary/80">
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
