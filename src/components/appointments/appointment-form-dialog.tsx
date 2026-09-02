"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calendar, Check, ChevronLeft, ChevronRight, Loader2, Search, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api";
import { createAppointment, getAvailableSlots, listEquipment, listRooms } from "@/lib/appointments/api";
import { listPatients } from "@/lib/patients/api";
import { listServices } from "@/lib/services/api";
import { listStaff } from "@/lib/staff/api";
import {
  formatTimeUtc,
  todayDateOnly,
  type AppointmentResourceRef,
} from "@/lib/validators/appointment";
import type { Patient } from "@/lib/validators/patient";
import { formatDuration } from "@/lib/validators/service";
import type { Service } from "@/lib/validators/service";
import type { StaffMember } from "@/lib/validators/staff";

const NONE_OPTION = "__none__";

const STEPS = ["patient", "service", "slot", "confirm"] as const;
type Step = (typeof STEPS)[number];

const SEARCH_DEBOUNCE_MS = 300;

interface Draft {
  patient: Patient | null;
  service: Service | null;
  staffMember: StaffMember | null;
  room: AppointmentResourceRef | null;
  equipment: AppointmentResourceRef | null;
  date: string;
  startAt: string | null;
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  patient: null,
  service: null,
  staffMember: null,
  room: null,
  equipment: null,
  date: todayDateOnly(),
  startAt: null,
  notes: "",
};

/**
 * Wizard de 4 pasos para reservar una cita (Módulo 06 Fase 2, spec §plan
 * "Modal de Nueva Cita"): paciente -> servicio+profesional -> fecha+slot ->
 * notas+confirmación. Cada paso valida antes de dejar avanzar al siguiente.
 */
export function AppointmentFormDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultStaffId,
  defaultRoomId,
  defaultEquipmentId,
  defaultStartAt,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "YYYY-MM-DD" del día que la agenda tiene enfocado — precarga el paso 3. */
  defaultDate?: string;
  /** Recurso de la columna donde se hizo clic en "+ Reservar" — precarga el
   *  paso 2 en cuanto el catálogo correspondiente termina de cargar. Solo
   *  uno de los tres aplica a la vez, según qué dimensión agrupa la grilla
   *  activa (staff/room/equipment). */
  defaultStaffId?: string;
  defaultRoomId?: string;
  defaultEquipmentId?: string;
  /** Hora exacta clickeada en la grilla — si coincide con uno de los slots
   *  libres que devuelve el paso 3, se preselecciona automáticamente. Nunca
   *  se fuerza un horario no validado por el motor de slots. */
  defaultStartAt?: string;
  onCreated: () => void;
}) {
  const t = useTranslations("Appointments");

  const [step, setStep] = useState<Step>("patient");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("patient");
      setDraft({ ...EMPTY_DRAFT, date: defaultDate ?? todayDateOnly() });
    }
  }, [open, defaultDate]);

  // --- Paso 1: paciente --------------------------------------------------

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);

  useEffect(() => {
    if (!open || step !== "patient") return;
    const timer = setTimeout(() => {
      setPatientLoading(true);
      void listPatients({ search: patientSearch.trim() || undefined, status: "ACTIVE", pageSize: 12 })
        .then((result) => setPatientResults(result.data))
        .catch(() => setPatientResults([]))
        .finally(() => setPatientLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, step, patientSearch]);

  // --- Paso 2: servicio + profesional -------------------------------------

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rooms, setRooms] = useState<AppointmentResourceRef[]>([]);
  const [equipment, setEquipment] = useState<AppointmentResourceRef[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    if (!open || step !== "service") return;
    setCatalogLoading(true);
    Promise.all([listServices({ isActive: true }), listStaff({ isActive: true }), listRooms(), listEquipment()])
      .then(([servicesPage, staffPage, roomsList, equipmentList]) => {
        setServices(servicesPage.data);
        setStaff(staffPage.data);
        setRooms(roomsList);
        setEquipment(equipmentList);
        if (defaultStaffId) {
          const preset = staffPage.data.find((member) => member.id === defaultStaffId);
          if (preset) setDraft((d) => (d.staffMember ? d : { ...d, staffMember: preset }));
        }
        if (defaultRoomId) {
          const preset = roomsList.find((room) => room.id === defaultRoomId);
          if (preset) setDraft((d) => (d.room ? d : { ...d, room: preset }));
        }
        if (defaultEquipmentId) {
          const preset = equipmentList.find((item) => item.id === defaultEquipmentId);
          if (preset) setDraft((d) => (d.equipment ? d : { ...d, equipment: preset }));
        }
      })
      .catch(() => {
        setServices([]);
        setStaff([]);
        setRooms([]);
        setEquipment([]);
      })
      .finally(() => setCatalogLoading(false));
    // defaultStaffId/defaultRoomId/defaultEquipmentId only apply once, right
    // after opening — not re-run every time the user picks something by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // --- Paso 3: fecha + slot ------------------------------------------------

  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const loadSlots = useCallback(() => {
    if (!draft.service || !draft.staffMember || !draft.date) return;
    setSlotsLoading(true);
    setSlotsError(null);
    getAvailableSlots({
      staffMemberId: draft.staffMember.id,
      serviceId: draft.service.id,
      date: draft.date,
    })
      .then((result) => {
        setSlots(result);
        // Best-effort: only preselects when the hour clicked in the grid
        // happens to be a genuinely free slot for this patient/service/
        // profesional combination — never invents or forces one.
        if (defaultStartAt && result.includes(defaultStartAt)) {
          setDraft((d) => (d.startAt ? d : { ...d, startAt: defaultStartAt }));
        }
      })
      .catch((error) => {
        setSlots([]);
        setSlotsError(getApiErrorMessage(error, t("wizard.slotsFailed")));
      })
      .finally(() => setSlotsLoading(false));
  }, [draft.service, draft.staffMember, draft.date, defaultStartAt, t]);

  useEffect(() => {
    if (!open || step !== "slot") return;
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, draft.date, draft.service?.id, draft.staffMember?.id]);

  // --- Navegación -----------------------------------------------------------

  const stepIndex = STEPS.indexOf(step);

  const canAdvance = useMemo(() => {
    switch (step) {
      case "patient":
        return draft.patient !== null;
      case "service":
        return draft.service !== null && draft.staffMember !== null;
      case "slot":
        return draft.startAt !== null;
      case "confirm":
        return true;
    }
  }, [step, draft]);

  function goNext() {
    if (!canAdvance) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  }

  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  async function confirm() {
    if (!draft.patient || !draft.service || !draft.staffMember || !draft.startAt) return;
    setSaving(true);
    try {
      await createAppointment({
        patientId: draft.patient.id,
        serviceId: draft.service.id,
        staffMemberId: draft.staffMember.id,
        roomId: draft.room?.id,
        equipmentId: draft.equipment?.id,
        startAt: draft.startAt,
        notes: draft.notes.trim() || undefined,
      });
      toast.success(t("wizard.created"));
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("wizard.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("wizard.title")}</DialogTitle>
          <DialogDescription>{t(`wizard.steps.${step}`)}</DialogDescription>
          <ol className="mt-1 flex items-center gap-1.5">
            {STEPS.map((s, index) => (
              <li
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  index <= stepIndex ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "patient" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  placeholder={t("wizard.patientSearchPlaceholder")}
                  className="pl-9"
                />
              </div>

              {patientLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : patientResults.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("wizard.noPatients")}
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {patientResults.map((patient) => (
                    <li key={patient.id}>
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, patient }))}
                        className={cn(
                          "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/60",
                          draft.patient?.id === patient.id && "bg-primary/5",
                        )}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                          <User className="size-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {patient.firstName} {patient.lastName}
                          </p>
                          {patient.phone && (
                            <p className="truncate text-xs text-muted-foreground">{patient.phone}</p>
                          )}
                        </div>
                        {draft.patient?.id === patient.id && (
                          <Check className="size-4 shrink-0 text-primary" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === "service" && (
            <div className="space-y-5">
              {catalogLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div>
                    <Label>{t("wizard.serviceLabel")}</Label>
                    <ul className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto">
                      {services.map((service) => (
                        <li key={service.id}>
                          <button
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, service, startAt: null }))}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                              draft.service?.id === service.id && "border-primary bg-primary/5",
                            )}
                          >
                            <span className="truncate text-foreground">{service.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDuration(service.durationMinutes, service.bufferMinutes)}
                            </span>
                          </button>
                        </li>
                      ))}
                      {services.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          {t("wizard.noServices")}
                        </p>
                      )}
                    </ul>
                  </div>

                  <div>
                    <Label>{t("wizard.staffLabel")}</Label>
                    <ul className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto">
                      {staff.map((member) => (
                        <li key={member.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((d) => ({ ...d, staffMember: member, startAt: null }))
                            }
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                              draft.staffMember?.id === member.id && "border-primary bg-primary/5",
                            )}
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: member.color ?? "var(--muted-foreground)" }}
                            />
                            <span className="truncate text-foreground">
                              {member.firstName} {member.lastName}
                            </span>
                          </button>
                        </li>
                      ))}
                      {staff.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          {t("wizard.noStaff")}
                        </p>
                      )}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("wizard.roomLabel")}</Label>
                      <Select
                        value={draft.room?.id ?? NONE_OPTION}
                        onValueChange={(value) =>
                          setDraft((d) => ({
                            ...d,
                            room: !value || value === NONE_OPTION ? null : (rooms.find((r) => r.id === value) ?? null),
                          }))
                        }
                      >
                        <SelectTrigger className="mt-1.5 w-full">
                          <SelectValue>
                            {(value: string | null) => {
                              if (!value || value === NONE_OPTION) return t("wizard.roomNone");
                              return rooms.find((room) => room.id === value)?.name ?? t("wizard.roomNone");
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_OPTION}>{t("wizard.roomNone")}</SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {rooms.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">{t("wizard.noRooms")}</p>
                      )}
                    </div>

                    <div>
                      <Label>{t("wizard.equipmentLabel")}</Label>
                      <Select
                        value={draft.equipment?.id ?? NONE_OPTION}
                        onValueChange={(value) =>
                          setDraft((d) => ({
                            ...d,
                            equipment:
                              !value || value === NONE_OPTION ? null : (equipment.find((e) => e.id === value) ?? null),
                          }))
                        }
                      >
                        <SelectTrigger className="mt-1.5 w-full">
                          <SelectValue>
                            {(value: string | null) => {
                              if (!value || value === NONE_OPTION) return t("wizard.equipmentNone");
                              return equipment.find((item) => item.id === value)?.name ?? t("wizard.equipmentNone");
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_OPTION}>{t("wizard.equipmentNone")}</SelectItem>
                          {equipment.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {equipment.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">{t("wizard.noEquipment")}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "slot" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="appointment-date">{t("wizard.dateLabel")}</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Calendar className="size-4 shrink-0 text-muted-foreground" />
                  <Input
                    id="appointment-date"
                    type="date"
                    value={draft.date}
                    min={todayDateOnly()}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, date: event.target.value, startAt: null }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label>{t("wizard.slotLabel")}</Label>
                {slotsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : slotsError ? (
                  <p className="mt-2 text-sm text-destructive">{slotsError}</p>
                ) : slots.length === 0 ? (
                  <p className="mt-2 py-4 text-center text-sm text-muted-foreground">
                    {t("wizard.noSlots")}
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, startAt: slot }))}
                        className={cn(
                          "rounded-lg border border-border px-2 py-1.5 text-center text-sm transition-colors hover:bg-muted/60",
                          draft.startAt === slot &&
                            "border-primary bg-primary text-primary-foreground hover:bg-primary",
                        )}
                      >
                        {formatTimeUtc(slot)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "confirm" && draft.patient && draft.service && draft.staffMember && draft.startAt && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <SummaryRow label={t("wizard.summary.patient")}>
                  {draft.patient.firstName} {draft.patient.lastName}
                </SummaryRow>
                <SummaryRow label={t("wizard.summary.service")}>{draft.service.name}</SummaryRow>
                <SummaryRow label={t("wizard.summary.staff")}>
                  {draft.staffMember.firstName} {draft.staffMember.lastName}
                </SummaryRow>
                {draft.room && <SummaryRow label={t("wizard.roomLabel")}>{draft.room.name}</SummaryRow>}
                {draft.equipment && (
                  <SummaryRow label={t("wizard.equipmentLabel")}>{draft.equipment.name}</SummaryRow>
                )}
                <SummaryRow label={t("wizard.summary.when")}>
                  {draft.date} — {formatTimeUtc(draft.startAt)}
                </SummaryRow>
              </div>

              <div>
                <Label htmlFor="appointment-notes">{t("wizard.notesLabel")}</Label>
                <Textarea
                  id="appointment-notes"
                  value={draft.notes}
                  onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
                  placeholder={t("wizard.notesPlaceholder")}
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4 sm:justify-between">
          <Button
            variant="outline"
            onClick={stepIndex === 0 ? () => onOpenChange(false) : goBack}
            disabled={saving}
          >
            <ChevronLeft className="mr-1 size-4" />
            {stepIndex === 0 ? t("wizard.cancel") : t("wizard.back")}
          </Button>
          {step === "confirm" ? (
            <Button onClick={() => void confirm()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("wizard.confirm")}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canAdvance}>
              {t("wizard.next")}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}
