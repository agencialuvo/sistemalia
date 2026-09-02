"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getApiErrorMessage } from "@/lib/api";
import { getMedicalHistory, upsertMedicalHistory } from "@/lib/patients/api";
import {
  FITZPATRICK_DESCRIPTIONS,
  FITZPATRICK_LABELS,
  FITZPATRICK_TYPES,
  SKIN_TYPE_OPTIONS,
  type FitzpatrickSkinType,
  type PatientMedicalHistory,
} from "@/lib/validators/patient";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const BLOOD_TYPE_NONE_SENTINEL = "__none__";
const FITZPATRICK_NONE_SENTINEL = "__none__";
const SKIN_TYPE_NONE_SENTINEL = "__none__";

/** Un switch de alerta MINSA — mismo shape para las 5 banderas booleanas, así
 *  se renderizan en un solo `.map` en vez de repetir el bloque 5 veces. */
interface AlertSwitch {
  key: "isPregnantOrLactating" | "roaccutaneLast12Months" | "keloidTendency" | "activeHerpesBreakout" | "frequentSunExposure";
  label: string;
}

interface ListField {
  key: "allergies" | "chronicConditions" | "currentMedications";
  label: string;
  placeholder: string;
}

/**
 * Tab 2 — Antecedentes Médicos (Fase 3, plan §1). One PUT per save: the
 * whole record is replaced, same upsert semantics as
 * PatientsService.upsertMedicalHistory.
 */
export function PatientMedicalHistoryTab({ patientId }: { patientId: string }) {
  const t = useTranslations("Patients.detail.medicalHistory");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [chronicConditions, setChronicConditions] = useState<string[]>([]);
  const [currentMedications, setCurrentMedications] = useState<string[]>([]);
  const [bloodType, setBloodType] = useState<string>("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");

  // --- Cumplimiento MINSA NTS N° 139 (Fase 4) ---
  const [fitzpatrickSkinType, setFitzpatrickSkinType] = useState<FitzpatrickSkinType | "">("");
  const [skinType, setSkinType] = useState("");
  const [isPregnantOrLactating, setIsPregnantOrLactating] = useState(false);
  const [roaccutaneLast12Months, setRoaccutaneLast12Months] = useState(false);
  const [keloidTendency, setKeloidTendency] = useState(false);
  const [activeHerpesBreakout, setActiveHerpesBreakout] = useState(false);
  const [frequentSunExposure, setFrequentSunExposure] = useState(false);
  const [smokingHabits, setSmokingHabits] = useState("");

  function applyHistory(history: PatientMedicalHistory | null) {
    setAllergies(history?.allergies ?? []);
    setChronicConditions(history?.chronicConditions ?? []);
    setCurrentMedications(history?.currentMedications ?? []);
    setBloodType(history?.bloodType ?? "");
    setEmergencyContactName(history?.emergencyContactName ?? "");
    setEmergencyContactPhone(history?.emergencyContactPhone ?? "");
    setFitzpatrickSkinType(history?.fitzpatrickSkinType ?? "");
    setSkinType(history?.skinType ?? "");
    setIsPregnantOrLactating(history?.isPregnantOrLactating ?? false);
    setRoaccutaneLast12Months(history?.roaccutaneLast12Months ?? false);
    setKeloidTendency(history?.keloidTendency ?? false);
    setActiveHerpesBreakout(history?.activeHerpesBreakout ?? false);
    setFrequentSunExposure(history?.frequentSunExposure ?? false);
    setSmokingHabits(history?.smokingHabits ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMedicalHistory(patientId)
      .then((history) => {
        if (!cancelled) applyHistory(history);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("saveFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, t]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const history = await upsertMedicalHistory(patientId, {
        allergies,
        chronicConditions,
        currentMedications,
        bloodType: bloodType || undefined,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        fitzpatrickSkinType: fitzpatrickSkinType || undefined,
        skinType: skinType || undefined,
        isPregnantOrLactating,
        roaccutaneLast12Months,
        keloidTendency,
        activeHerpesBreakout,
        frequentSunExposure,
        smokingHabits: smokingHabits.trim() || undefined,
      });
      applyHistory(history);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }, [
    patientId,
    allergies,
    chronicConditions,
    currentMedications,
    bloodType,
    emergencyContactName,
    emergencyContactPhone,
    fitzpatrickSkinType,
    skinType,
    isPregnantOrLactating,
    roaccutaneLast12Months,
    keloidTendency,
    activeHerpesBreakout,
    frequentSunExposure,
    smokingHabits,
    t,
  ]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const listFields: Array<{
    field: ListField;
    value: string[];
    setValue: (value: string[]) => void;
  }> = [
    {
      field: { key: "allergies", label: t("allergiesLabel"), placeholder: t("allergiesPlaceholder") },
      value: allergies,
      setValue: setAllergies,
    },
    {
      field: {
        key: "chronicConditions",
        label: t("chronicConditionsLabel"),
        placeholder: t("chronicConditionsPlaceholder"),
      },
      value: chronicConditions,
      setValue: setChronicConditions,
    },
    {
      field: {
        key: "currentMedications",
        label: t("medicationsLabel"),
        placeholder: t("medicationsPlaceholder"),
      },
      value: currentMedications,
      setValue: setCurrentMedications,
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      {listFields.map(({ field, value, setValue }) => (
        <ChipListField key={field.key} field={field} value={value} onChange={setValue} />
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("bloodTypeLabel")}</Label>
          <Select
            value={bloodType || BLOOD_TYPE_NONE_SENTINEL}
            onValueChange={(value) =>
              setBloodType(!value || value === BLOOD_TYPE_NONE_SENTINEL ? "" : value)
            }
          >
            <SelectTrigger className="mt-1.5 w-full">
              <SelectValue>
                {(value: string | null) =>
                  !value || value === BLOOD_TYPE_NONE_SENTINEL ? t("bloodTypeNone") : value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BLOOD_TYPE_NONE_SENTINEL}>{t("bloodTypeNone")}</SelectItem>
              {BLOOD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("emergencyContactTitle")}
        </h3>
        <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="emergency-name">{t("emergencyNameLabel")}</Label>
            <Input
              id="emergency-name"
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.target.value)}
              placeholder={t("emergencyNamePlaceholder")}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="emergency-phone">{t("emergencyPhoneLabel")}</Label>
            <Input
              id="emergency-phone"
              type="tel"
              inputMode="tel"
              value={emergencyContactPhone}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                setEmergencyContactPhone(digits ? `+${digits.slice(0, 15)}` : "");
              }}
              placeholder={t("emergencyPhonePlaceholder")}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("minsaTitle")}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("minsaHelp")}</p>

        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("fitzpatrickLabel")}</Label>
              <Select
                value={fitzpatrickSkinType || FITZPATRICK_NONE_SENTINEL}
                onValueChange={(value) =>
                  setFitzpatrickSkinType(
                    !value || value === FITZPATRICK_NONE_SENTINEL ? "" : (value as FitzpatrickSkinType),
                  )
                }
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      !value || value === FITZPATRICK_NONE_SENTINEL
                        ? t("fitzpatrickNone")
                        : FITZPATRICK_LABELS[value as FitzpatrickSkinType]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FITZPATRICK_NONE_SENTINEL}>{t("fitzpatrickNone")}</SelectItem>
                  {FITZPATRICK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex flex-col gap-0.5 py-0.5">
                        <span className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {FITZPATRICK_LABELS[type]}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">{FITZPATRICK_DESCRIPTIONS[type]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fitzpatrickSkinType && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {FITZPATRICK_DESCRIPTIONS[fitzpatrickSkinType]}
                </p>
              )}
            </div>

            <div>
              <Label>{t("skinTypeLabel")}</Label>
              <Select
                value={skinType || SKIN_TYPE_NONE_SENTINEL}
                onValueChange={(value) =>
                  setSkinType(!value || value === SKIN_TYPE_NONE_SENTINEL ? "" : value)
                }
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      !value || value === SKIN_TYPE_NONE_SENTINEL ? t("skinTypeNone") : value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIN_TYPE_NONE_SENTINEL}>{t("skinTypeNone")}</SelectItem>
                  {SKIN_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            {(
              [
                { key: "isPregnantOrLactating", label: t("isPregnantOrLactatingLabel") },
                { key: "roaccutaneLast12Months", label: t("roaccutaneLabel") },
                { key: "keloidTendency", label: t("keloidTendencyLabel") },
                { key: "activeHerpesBreakout", label: t("activeHerpesBreakoutLabel") },
                { key: "frequentSunExposure", label: t("frequentSunExposureLabel") },
              ] satisfies AlertSwitch[]
            ).map((item) => {
              const alertValues: Record<AlertSwitch["key"], boolean> = {
                isPregnantOrLactating,
                roaccutaneLast12Months,
                keloidTendency,
                activeHerpesBreakout,
                frequentSunExposure,
              };
              const setters: Record<AlertSwitch["key"], (value: boolean) => void> = {
                isPregnantOrLactating: setIsPregnantOrLactating,
                roaccutaneLast12Months: setRoaccutaneLast12Months,
                keloidTendency: setKeloidTendency,
                activeHerpesBreakout: setActiveHerpesBreakout,
                frequentSunExposure: setFrequentSunExposure,
              };
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <Label htmlFor={`minsa-${item.key}`} className="cursor-pointer text-sm font-normal">
                    {item.label}
                  </Label>
                  <Switch
                    id={`minsa-${item.key}`}
                    checked={alertValues[item.key]}
                    onCheckedChange={setters[item.key]}
                  />
                </div>
              );
            })}
          </div>

          <div>
            <Label htmlFor="smoking-habits">{t("smokingHabitsLabel")}</Label>
            <Input
              id="smoking-habits"
              value={smokingHabits}
              onChange={(event) => setSmokingHabits(event.target.value)}
              placeholder={t("smokingHabitsPlaceholder")}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {t("saveButton")}
        </Button>
      </div>
    </div>
  );
}

function ChipListField({
  field,
  value,
  onChange,
}: {
  field: ListField;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const entry = draft.trim();
    if (!entry || value.includes(entry) || value.length >= 50) return;
    onChange([...value, entry]);
    setDraft("");
  }

  function remove(entry: string) {
    onChange(value.filter((item) => item !== entry));
  }

  return (
    <div>
      <Label>{field.label}</Label>
      <div className="mt-2 space-y-2">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.map((entry) => (
              <Badge key={entry} variant="secondary" className="h-6 gap-1 pr-1">
                {entry}
                <button
                  type="button"
                  onClick={() => remove(entry)}
                  className="rounded-full p-0.5 hover:bg-background/60"
                  aria-label={entry}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder={field.placeholder}
            className="h-9"
          />
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="mr-1 size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
