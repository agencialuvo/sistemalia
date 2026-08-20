"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectableCard } from "@/components/onboarding/selectable-card";
import { StepProgress } from "@/components/onboarding/step-progress";
import type { OnboardingDraft } from "@/components/onboarding/types";
import { api, getApiErrorMessage } from "@/lib/api";
import { isValidRuc, step1Schema } from "@/lib/validators/tenant";

interface SunatQueryResult {
  success: boolean;
  source: "cache" | "sunat" | "mock";
  data: {
    ruc: string;
    razonSocial: string;
    direccionFiscal: string;
    estado: string;
    condicion: string;
  } | null;
  manualEntry: boolean;
  message: string;
}

/**
 * Paso 1 — Identidad del negocio y perfil fiscal.
 *
 * The RUC lookup is an assist, never a gate: the spec is explicit that a SUNAT
 * failure must not block onboarding, so a failed query unlocks the fields for
 * manual entry instead of stopping the wizard.
 */
export function Step1Identity({
  data,
  onChange,
  onNext,
}: {
  data: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  onNext: () => void;
}) {
  const t = useTranslations("Onboarding");

  const [querying, setQuerying] = useState(false);
  const [lookup, setLookup] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);
  // Until SUNAT answers (or fails) the autocompleted fields stay read-only, so
  // the user cannot silently overwrite official data with a typo. A failed or
  // inactive lookup flips this on — that is the manual-entry fallback.
  const [manualEntry, setManualEntry] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rucLookupEnabled = isValidRuc(data.taxId) && !querying;

  async function onQueryRuc() {
    setQuerying(true);
    setLookup(null);
    try {
      const { data: result } = await api.get<SunatQueryResult>(
        `/api/v1/tax/sunat/${data.taxId}`,
      );

      if (result.success && result.data) {
        onChange({
          legalName: result.data.razonSocial,
          fiscalAddress: result.data.direccionFiscal,
        });
        setManualEntry(false);
        setLookup({ tone: "ok", message: t("step1.sunatFound") });
      } else {
        // Not found / INACTIVO / NO HABIDO. Show what SUNAT said and let the
        // user type the data in.
        setManualEntry(true);
        setLookup({ tone: "warn", message: result.message });
      }
    } catch (error) {
      // Network error or the API itself is down — same fallback.
      setManualEntry(true);
      setLookup({ tone: "warn", message: getApiErrorMessage(error, t("step1.sunatUnavailable")) });
    } finally {
      setQuerying(false);
    }
  }

  function onContinue() {
    const parsed = step1Schema.safeParse({
      identityType: data.identityType,
      taxIdType: data.taxIdType,
      taxId: data.taxId,
      legalName: data.legalName,
      fiscalAddress: data.fiscalAddress || undefined,
      commercialName: data.commercialName,
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
    onNext();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <StepProgress current={1} />

      <h1 className="text-lg font-semibold text-foreground">{t("step1.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("step1.description")}</p>

      <div className="mt-6 space-y-5">
        {/* Tipo de identidad */}
        <div>
          <Label className="mb-2 block">{t("step1.identityTypeLabel")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SelectableCard
              active={data.identityType === "EMPRESA"}
              title={t("step1.identityTypeEmpresa")}
              onClick={() => onChange({ identityType: "EMPRESA" })}
            />
            <SelectableCard
              active={data.identityType === "MARCA_PERSONAL"}
              title={t("step1.identityTypePersonal")}
              onClick={() => onChange({ identityType: "MARCA_PERSONAL" })}
            />
          </div>
          {errors.identityType && <FieldError message={errors.identityType} />}
        </div>

        {/* Tipo de contribuyente */}
        <div>
          <Label className="mb-2 block">{t("step1.taxIdTypeLabel")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SelectableCard
              active={data.taxIdType === "RUC10"}
              title={t("step1.taxIdTypeRuc10")}
              onClick={() => onChange({ taxIdType: "RUC10" })}
            />
            <SelectableCard
              active={data.taxIdType === "RUC20"}
              title={t("step1.taxIdTypeRuc20")}
              onClick={() => onChange({ taxIdType: "RUC20" })}
            />
          </div>
          {errors.taxIdType && <FieldError message={errors.taxIdType} />}
        </div>

        {/* RUC + consulta */}
        <div>
          <Label htmlFor="taxId">{t("step1.taxIdLabel")}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="taxId"
              inputMode="numeric"
              maxLength={11}
              placeholder={t("step1.taxIdPlaceholder")}
              value={data.taxId}
              onChange={(e) => {
                // Digits only: the field is numeric and the Módulo 11 check
                // would reject anything else anyway.
                onChange({ taxId: e.target.value.replace(/\D/g, "").slice(0, 11) });
                setLookup(null);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!rucLookupEnabled}
              onClick={onQueryRuc}
              className="shrink-0"
            >
              {querying ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Search className="mr-1.5 size-4" />
              )}
              {querying ? t("step1.sunatQuerying") : t("step1.sunatQuery")}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("step1.taxIdHint")}</p>
          {errors.taxId && <FieldError message={errors.taxId} />}

          {lookup && (
            <p
              className={
                lookup.tone === "ok"
                  ? "mt-2 flex items-start gap-1.5 text-xs text-foreground"
                  : "mt-2 flex items-start gap-1.5 text-xs text-destructive"
              }
            >
              {lookup.tone === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{lookup.message}</span>
            </p>
          )}
          {manualEntry && (
            <p className="mt-1 text-xs text-muted-foreground">{t("step1.manualEntryHint")}</p>
          )}
        </div>

        {/* Razón social (autocompletada) */}
        <div>
          <Label htmlFor="legalName">{t("step1.legalNameLabel")}</Label>
          <Input
            id="legalName"
            className="mt-1.5"
            placeholder={t("step1.legalNamePlaceholder")}
            value={data.legalName}
            onChange={(e) => onChange({ legalName: e.target.value })}
          />
          {errors.legalName && <FieldError message={errors.legalName} />}
        </div>

        {/* Dirección fiscal (autocompletada) */}
        <div>
          <Label htmlFor="fiscalAddress">{t("step1.fiscalAddressLabel")}</Label>
          <Input
            id="fiscalAddress"
            className="mt-1.5"
            placeholder={t("step1.fiscalAddressPlaceholder")}
            value={data.fiscalAddress}
            onChange={(e) => onChange({ fiscalAddress: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("step1.fiscalAddressHint")}</p>
          {errors.fiscalAddress && <FieldError message={errors.fiscalAddress} />}
        </div>

        {/* Nombre comercial */}
        <div>
          <Label htmlFor="commercialName">{t("step1.commercialNameLabel")}</Label>
          <Input
            id="commercialName"
            className="mt-1.5"
            placeholder={t("step1.commercialNamePlaceholder")}
            value={data.commercialName}
            onChange={(e) => onChange({ commercialName: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("step1.commercialNameHint")}</p>
          {errors.commercialName && <FieldError message={errors.commercialName} />}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onContinue}>
          {t("step1.next")}
        </Button>
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}
