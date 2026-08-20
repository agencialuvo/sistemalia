"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageUp, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepProgress } from "@/components/onboarding/step-progress";
import type { OnboardingDraft } from "@/components/onboarding/types";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  SPECIALTY_CATEGORIES,
  type SpecialtyCategory,
  step3Schema,
  validateLogoFile,
} from "@/lib/validators/tenant";
import { cn } from "@/lib/utils";

/** Message key per specialty, so the enum stays the single source of order. */
const SPECIALTY_LABEL_KEYS: Record<SpecialtyCategory, string> = {
  MEDICINA_ESTETICA: "step3.categoryMedicina",
  COSMETOLOGIA_SPA: "step3.categoryCosmetologia",
  CEJAS_PESTANAS: "step3.categoryCejas",
  SALON_BELLEZA: "step3.categorySalon",
  DERMATOLOGIA: "step3.categoryDermatologia",
};

/**
 * Paso 3 — Identidad visual y rubro principal.
 *
 * The logo is uploaded as soon as it is picked (not on "Finalizar"), so the
 * final onboarding request carries a plain `logoUrl` string and stays a small
 * JSON body. It also means a failed upload is reported while the user is still
 * looking at the file picker, instead of sinking the whole provisioning call.
 */
export function Step3Branding({
  data,
  onChange,
  onBack,
  onFinish,
  finishing,
}: {
  data: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onFinish: () => void;
  finishing: boolean;
}) {
  const t = useTranslations("Onboarding");
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function uploadLogo(file: File) {
    // Fail fast in the browser; UploadService re-checks size/MIME and also
    // verifies the magic bytes, which is the check that actually holds.
    const localError = validateLogoFile(file);
    if (localError) {
      setUploadError(localError);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: result } = await api.post<{ logoUrl: string }>(
        "/tenant/upload-logo",
        form,
      );
      onChange({ logoUrl: result.logoUrl });
    } catch (error) {
      setUploadError(getApiErrorMessage(error, t("step3.uploadFailedGeneric")));
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadLogo(file);
  }

  function onFinishClick() {
    const parsed = step3Schema.safeParse({
      specialty: data.specialty,
      logoUrl: data.logoUrl ?? undefined,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    onFinish();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <StepProgress current={3} />

      <h1 className="text-lg font-semibold text-foreground">{t("step3.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("step3.description")}</p>

      <div className="mt-6 space-y-5">
        {/* Logotipo */}
        <div>
          <Label className="mb-2 block">{t("step3.logoLabel")}</Label>

          {data.logoUrl ? (
            <div className="flex items-center gap-4 rounded-lg border border-border p-3">
              <Image
                src={data.logoUrl}
                alt={t("step3.logoLabel")}
                width={64}
                height={64}
                unoptimized
                className="size-16 rounded-md object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{t("step3.logoReady")}</p>
                <p className="truncate text-xs text-muted-foreground">{data.logoUrl}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ logoUrl: null })}
              >
                <X className="mr-1 size-3.5" />
                {t("step3.logoRemove")}
              </Button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
              )}
            >
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <ImageUp className="size-6 text-muted-foreground" />
              )}
              <p className="text-sm text-foreground">
                {uploading ? t("step3.logoUploading") : t("step3.logoDropHint")}
              </p>
              <p className="text-xs text-muted-foreground">{t("step3.logoFormatsHint")}</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadLogo(file);
              // Reset so re-picking the same file after an error still fires
              // onChange.
              e.target.value = "";
            }}
          />

          {uploadError && <p className="mt-1 text-xs text-destructive">{uploadError}</p>}
        </div>

        {/* Rubro / especialidad */}
        <div>
          <Label>{t("step3.categoryLabel")}</Label>
          <Select
            value={data.specialty || undefined}
            onValueChange={(value) => onChange({ specialty: value as SpecialtyCategory })}
          >
            <SelectTrigger className="mt-1.5 w-full">
              <SelectValue placeholder={t("step3.categoryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {SPECIALTY_CATEGORIES.map((specialty) => (
                <SelectItem key={specialty} value={specialty}>
                  {t(SPECIALTY_LABEL_KEYS[specialty])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{t("step3.categoryHint")}</p>
          {errors.specialty && <p className="mt-1 text-xs text-destructive">{errors.specialty}</p>}
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <Button type="button" variant="secondary" onClick={onBack} disabled={finishing}>
          {t("step3.back")}
        </Button>
        <Button type="button" onClick={onFinishClick} disabled={finishing || uploading}>
          {finishing && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {finishing ? t("step3.finishing") : t("step3.finish")}
        </Button>
      </div>
    </div>
  );
}
