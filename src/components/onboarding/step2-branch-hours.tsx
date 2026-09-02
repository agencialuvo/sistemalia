"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CopyCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeOfDayPicker } from "@/components/ui/minutes-time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StepProgress } from "@/components/onboarding/step-progress";
import {
  DAY_LABELS,
  type BranchDraft,
  type OnboardingDraft,
  type WorkingHourDraft,
} from "@/components/onboarding/types";
import { APPOINTMENT_DURATIONS, step2Schema } from "@/lib/validators/tenant";

interface UbigeoDistrict {
  code: string;
  name: string;
}
interface UbigeoProvince {
  code: string;
  name: string;
  districts: UbigeoDistrict[];
}
interface UbigeoRegion {
  code: string;
  name: string;
  provinces: UbigeoProvince[];
}

/**
 * Paso 2 — Sede principal, ubicación y horarios de atención.
 *
 * The Ubigeo dataset (~80KB, 1,867 districts) is pulled with a dynamic import
 * so it only costs anything once this step actually renders — it would
 * otherwise ride along in the initial bundle of a route most sessions hit once.
 */
export function Step2BranchHours({
  data,
  onChange,
  onBack,
  onNext,
}: {
  data: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("Onboarding");

  const [regions, setRegions] = useState<UbigeoRegion[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    import("@/lib/data/ubigeo-peru.json")
      .then((mod) => {
        if (!cancelled) setRegions(mod.default as UbigeoRegion[]);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const branch = data.branch;

  const provinces = useMemo(
    () => regions?.find((r) => r.code === branch.regionCode)?.provinces ?? [],
    [regions, branch.regionCode],
  );
  const districts = useMemo(
    () => provinces.find((p) => p.code === branch.provinceCode)?.districts ?? [],
    [provinces, branch.provinceCode],
  );

  function patchBranch(patch: Partial<BranchDraft>) {
    onChange({ branch: { ...branch, ...patch } });
  }

  function patchDay(index: number, patch: Partial<WorkingHourDraft>) {
    patchBranch({
      workingHours: branch.workingHours.map((hour, i) =>
        i === index ? { ...hour, ...patch } : hour,
      ),
    });
  }

  /**
   * Copies one row's schedule onto every other OPEN day (spec Paso 2.2.3).
   * Closed days are left alone — overwriting them would silently re-open days
   * the user deliberately turned off.
   */
  function applyToAllOpenDays(source: WorkingHourDraft) {
    patchBranch({
      workingHours: branch.workingHours.map((hour) =>
        hour.isOpen
          ? {
              ...hour,
              openTime: source.openTime,
              closeTime: source.closeTime,
              breakStart: source.breakStart,
              breakEnd: source.breakEnd,
            }
          : hour,
      ),
    });
  }

  function onContinue() {
    const parsed = step2Schema.safeParse({
      name: branch.name,
      address: branch.address,
      ubigeoCode: branch.ubigeoCode,
      whatsappNumber: branch.whatsappNumber.replace(/\s+/g, ""),
      defaultAppointmentMinutes: branch.defaultAppointmentMinutes,
      workingHours: branch.workingHours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        isOpen: hour.isOpen,
        openTime: hour.openTime,
        closeTime: hour.closeTime,
        breakStart: hour.breakStart || undefined,
        breakEnd: hour.breakEnd || undefined,
      })),
    });

    if (!parsed.success) {
      const nextFields: Record<string, string> = {};
      const nextDays: Record<number, string> = {};

      for (const issue of parsed.error.issues) {
        // Nested issues arrive as ["workingHours", <index>, <field>]; anchor
        // those on the matrix row so the message lands next to the offending
        // day instead of at the bottom of the form.
        if (issue.path[0] === "workingHours" && typeof issue.path[1] === "number") {
          const index = issue.path[1];
          if (!nextDays[index]) nextDays[index] = issue.message;
          continue;
        }
        const key = String(issue.path[0] ?? "");
        if (key && !nextFields[key]) nextFields[key] = issue.message;
      }

      setErrors(nextFields);
      setDayErrors(nextDays);
      return;
    }

    setErrors({});
    setDayErrors({});
    onNext();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <StepProgress current={2} />

      <h1 className="text-lg font-semibold text-foreground">{t("step2.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("step2.description")}</p>

      <div className="mt-6 space-y-5">
        <div>
          <Label htmlFor="branchName">{t("step2.branchNameLabel")}</Label>
          <Input
            id="branchName"
            className="mt-1.5"
            maxLength={120}
            placeholder={t("step2.branchNamePlaceholder")}
            value={branch.name}
            onChange={(e) => patchBranch({ name: e.target.value })}
          />
          {errors.name && <FieldError message={errors.name} />}
        </div>

        <div>
          <Label htmlFor="branchAddress">{t("step2.addressLabel")}</Label>
          <Input
            id="branchAddress"
            className="mt-1.5"
            maxLength={255}
            placeholder={t("step2.addressPlaceholder")}
            value={branch.address}
            onChange={(e) => patchBranch({ address: e.target.value })}
          />
          {errors.address && <FieldError message={errors.address} />}
        </div>

        {/* Ubigeo en cascada */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>{t("step2.regionLabel")}</Label>
            <Select
              value={branch.regionCode || undefined}
              onValueChange={(value) =>
                // Selecting a new parent invalidates both children — keeping a
                // stale district would submit a code from another region.
                patchBranch({
                  regionCode: (value as string) ?? "",
                  provinceCode: "",
                  ubigeoCode: "",
                })
              }
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue placeholder={t("step2.regionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(regions ?? []).map((region) => (
                  <SelectItem key={region.code} value={region.code}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("step2.provinceLabel")}</Label>
            <Select
              value={branch.provinceCode || undefined}
              disabled={!branch.regionCode}
              onValueChange={(value) =>
                patchBranch({ provinceCode: (value as string) ?? "", ubigeoCode: "" })
              }
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue placeholder={t("step2.provincePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {provinces.map((province) => (
                  <SelectItem key={province.code} value={province.code}>
                    {province.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("step2.districtLabel")}</Label>
            <Select
              value={branch.ubigeoCode || undefined}
              disabled={!branch.provinceCode}
              onValueChange={(value) => patchBranch({ ubigeoCode: (value as string) ?? "" })}
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue placeholder={t("step2.districtPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {districts.map((district) => (
                  <SelectItem key={district.code} value={district.code}>
                    {district.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {regions === null && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {t("step2.loadingUbigeo")}
          </p>
        )}
        {errors.ubigeoCode && <FieldError message={errors.ubigeoCode} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="whatsappNumber">{t("step2.whatsappLabel")}</Label>
            <Input
              id="whatsappNumber"
              className="mt-1.5"
              inputMode="tel"
              placeholder={t("step2.whatsappPlaceholder")}
              value={branch.whatsappNumber}
              onChange={(e) =>
                // Keep a single leading "+" and digits only, so the value always
                // matches the E.164 shape the API expects.
                patchBranch({
                  whatsappNumber: "+" + e.target.value.replace(/\D/g, "").slice(0, 15),
                })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("step2.whatsappHint")}</p>
            {errors.whatsappNumber && <FieldError message={errors.whatsappNumber} />}
          </div>

          <div>
            <Label>{t("step2.appointmentDurationLabel")}</Label>
            <Select
              value={String(branch.defaultAppointmentMinutes)}
              onValueChange={(value) =>
                patchBranch({
                  defaultAppointmentMinutes: Number(value) as BranchDraft["defaultAppointmentMinutes"],
                })
              }
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_DURATIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {t("step2.appointmentDurationOption", { minutes })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("step2.appointmentDurationHint")}
            </p>
          </div>
        </div>

        {/* Matriz de días y horarios */}
        <div>
          <Label className="mb-2 block">{t("step2.hoursLabel")}</Label>
          <div className="divide-y divide-border rounded-lg border border-border">
            {branch.workingHours.map((hour, index) => (
              <div key={hour.dayOfWeek} className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex w-32 shrink-0 items-center gap-2">
                    <Switch
                      checked={hour.isOpen}
                      onCheckedChange={(checked) => patchDay(index, { isOpen: checked })}
                      aria-label={DAY_LABELS[hour.dayOfWeek]}
                    />
                    <span
                      className={
                        hour.isOpen
                          ? "text-sm font-medium text-foreground"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {DAY_LABELS[hour.dayOfWeek]}
                    </span>
                  </div>

                  {hour.isOpen ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <TimeField
                        label={t("step2.openTime")}
                        value={hour.openTime}
                        onChange={(value) => patchDay(index, { openTime: value })}
                      />
                      <TimeField
                        label={t("step2.closeTime")}
                        value={hour.closeTime}
                        onChange={(value) => patchDay(index, { closeTime: value })}
                      />
                      <TimeField
                        label={t("step2.breakStart")}
                        value={hour.breakStart}
                        optional
                        onChange={(value) => patchDay(index, { breakStart: value })}
                      />
                      <TimeField
                        label={t("step2.breakEnd")}
                        value={hour.breakEnd}
                        optional
                        onChange={(value) => patchDay(index, { breakEnd: value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => applyToAllOpenDays(hour)}
                        title={t("step2.applyToAll")}
                      >
                        <CopyCheck className="mr-1 size-3.5" />
                        {t("step2.applyToAll")}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t("step2.closed")}</span>
                  )}
                </div>
                {dayErrors[index] && <FieldError message={dayErrors[index]} />}
              </div>
            ))}
          </div>
          {errors.workingHours && <FieldError message={errors.workingHours} />}
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <Button type="button" variant="secondary" onClick={onBack}>
          {t("step2.back")}
        </Button>
        <Button type="button" onClick={onContinue}>
          {t("step2.next")}
        </Button>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <TimeOfDayPicker
        className="h-8 w-28"
        value={value}
        // An empty break bound is meaningful ("no break"), so it is kept as ""
        // and only converted to undefined when the payload is built.
        onChange={onChange}
        ariaLabel={optional ? `${label} (opcional)` : label}
      />
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}
