"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  Calendar as CalendarIcon,
  CheckCircle2,
  Loader2,
  Phone,
  PlayCircle,
  Stethoscope,
  UserX,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import {
  cancelAppointment,
  getAvailableSlots,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "@/lib/appointments/api";
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TRANSITIONS,
  formatDateUtc,
  formatTimeUtc,
  todayDateOnly,
  type Appointment,
  type AppointmentStatus,
} from "@/lib/validators/appointment";

/** PENDING/CONFIRMED son las únicas etapas donde "reagendar" tiene sentido —
 *  una cita IN_SERVICE ya está sucediendo, y las demás son terminales. */
const RESCHEDULABLE_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED"];

const STATUS_ICON: Record<AppointmentStatus, typeof CheckCircle2> = {
  PENDING: CheckCircle2,
  CONFIRMED: PlayCircle,
  IN_SERVICE: CheckCircle2,
  COMPLETED: CheckCircle2,
  CANCELLED: Ban,
  NO_SHOW: UserX,
};

/**
 * Detalle de una cita + accesos directos de cambio de estado (spec §plan
 * "Modal de Detalle"). CANCELLED pide un motivo antes de confirmar; el resto
 * de transiciones son de un solo clic.
 */
export function AppointmentDetailDialog({
  open,
  onOpenChange,
  appointment,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  onChanged: () => void;
}) {
  const t = useTranslations("Appointments");
  const router = useRouter();

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [reschedulingOpen, setReschedulingOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(null);

  useEffect(() => {
    if (!appointment || !reschedulingOpen || !rescheduleDate) return;
    setRescheduleSlotsLoading(true);
    setRescheduleSlotsError(null);
    getAvailableSlots({
      staffMemberId: appointment.staffMemberId,
      serviceId: appointment.serviceId,
      date: rescheduleDate,
    })
      .then((result) => setRescheduleSlots(result))
      .catch((error) => {
        setRescheduleSlots([]);
        setRescheduleSlotsError(getApiErrorMessage(error, t("wizard.slotsFailed")));
      })
      .finally(() => setRescheduleSlotsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id, reschedulingOpen, rescheduleDate]);

  if (!appointment) return null;

  const transitions = APPOINTMENT_STATUS_TRANSITIONS[appointment.status];
  const canReschedule = RESCHEDULABLE_STATUSES.includes(appointment.status);

  function openReschedule() {
    setReschedulingOpen(true);
    setRescheduleDate(todayDateOnly());
    setRescheduleSlot(null);
    setRescheduleSlots([]);
  }

  async function confirmReschedule() {
    if (!appointment || !rescheduleSlot) return;
    setBusy(true);
    try {
      await rescheduleAppointment(appointment.id, { startAt: rescheduleSlot });
      toast.success(t("detail.rescheduled"));
      setReschedulingOpen(false);
      onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("detail.rescheduleFailed")));
    } finally {
      setBusy(false);
    }
  }

  function goToClinicalRecord() {
    if (!appointment) return;
    router.push(
      `/pacientes/${appointment.patientId}?tab=clinical-records&appointmentId=${appointment.id}`,
    );
  }

  async function applyStatus(status: AppointmentStatus) {
    if (!appointment) return;
    setBusy(true);
    try {
      await updateAppointmentStatus(appointment.id, status);
      toast.success(t(`detail.statusChanged.${status}`));
      onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("detail.statusChangeFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!appointment) return;
    setBusy(true);
    try {
      await cancelAppointment(appointment.id, cancelReason.trim() || undefined);
      toast.success(t("detail.statusChanged.CANCELLED"));
      setConfirmingCancel(false);
      setCancelReason("");
      onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("detail.statusChangeFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          setConfirmingCancel(false);
          setCancelReason("");
          setReschedulingOpen(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg">
              {appointment.patient.firstName} {appointment.patient.lastName}
            </DialogTitle>
            <Badge className={APPOINTMENT_STATUS_COLORS[appointment.status]} variant="outline">
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Badge>
          </div>
          <DialogDescription>
            {formatDateUtc(appointment.startAt)} · {formatTimeUtc(appointment.startAt)}–
            {formatTimeUtc(appointment.endAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5 text-sm">
          <DetailRow label={t("detail.service")}>{appointment.service.name}</DetailRow>
          <DetailRow label={t("detail.staff")}>
            {appointment.staffMember.firstName} {appointment.staffMember.lastName}
          </DetailRow>
          {appointment.room && <DetailRow label={t("detail.room")}>{appointment.room.name}</DetailRow>}
          {appointment.equipment && (
            <DetailRow label={t("detail.equipment")}>{appointment.equipment.name}</DetailRow>
          )}
          {appointment.patient.phone && (
            <DetailRow label={t("detail.phone")}>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground" />
                {appointment.patient.phone}
              </span>
            </DetailRow>
          )}
          {appointment.notes && <DetailRow label={t("detail.notes")}>{appointment.notes}</DetailRow>}
          {appointment.status === "CANCELLED" && appointment.cancellationReason && (
            <DetailRow label={t("detail.cancellationReason")}>
              {appointment.cancellationReason}
            </DetailRow>
          )}

          {confirmingCancel && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="cancel-reason">{t("detail.cancelReasonLabel")}</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={t("detail.cancelReasonPlaceholder")}
                rows={2}
                autoFocus
              />
            </div>
          )}

          {reschedulingOpen && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 pt-1">
              <div>
                <Label htmlFor="reschedule-date">{t("detail.rescheduleDateLabel")}</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                  <Input
                    id="reschedule-date"
                    type="date"
                    value={rescheduleDate}
                    min={todayDateOnly()}
                    onChange={(event) => {
                      setRescheduleDate(event.target.value);
                      setRescheduleSlot(null);
                    }}
                  />
                </div>
              </div>

              <div>
                <Label>{t("detail.rescheduleSlotLabel")}</Label>
                {rescheduleSlotsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : rescheduleSlotsError ? (
                  <p className="mt-2 text-sm text-destructive">{rescheduleSlotsError}</p>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="mt-2 py-2 text-center text-sm text-muted-foreground">
                    {t("wizard.noSlots")}
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {rescheduleSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setRescheduleSlot(slot)}
                        className={`rounded-lg border border-border px-2 py-1.5 text-center text-sm transition-colors hover:bg-muted/60 ${
                          rescheduleSlot === slot
                            ? "border-primary bg-primary text-primary-foreground hover:bg-primary"
                            : ""
                        }`}
                      >
                        {formatTimeUtc(slot)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {appointment.status === "COMPLETED" && (
            <button
              type="button"
              onClick={goToClinicalRecord}
              className="flex items-center gap-1.5 pt-1 text-sm font-medium text-primary hover:underline"
            >
              <Stethoscope className="size-4" />
              {t("detail.goToClinicalRecord")}
            </button>
          )}
        </div>

        <DialogFooter className="border-t border-border/80 px-6 py-4 sm:flex-wrap sm:justify-end">
          {confirmingCancel ? (
            <>
              <Button variant="outline" onClick={() => setConfirmingCancel(false)} disabled={busy}>
                {t("wizard.back")}
              </Button>
              <Button variant="destructive" onClick={() => void confirmCancel()} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t("detail.confirmCancel")}
              </Button>
            </>
          ) : reschedulingOpen ? (
            <>
              <Button variant="outline" onClick={() => setReschedulingOpen(false)} disabled={busy}>
                {t("wizard.back")}
              </Button>
              <Button onClick={() => void confirmReschedule()} disabled={busy || !rescheduleSlot}>
                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t("detail.confirmReschedule")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                {t("detail.close")}
              </Button>
              {canReschedule && (
                <Button variant="outline" onClick={openReschedule} disabled={busy}>
                  <CalendarClock className="mr-1.5 size-4" />
                  {t("detail.actions.RESCHEDULE")}
                </Button>
              )}
              {transitions
                .filter((status) => status !== "CANCELLED")
                .map((status) => {
                  const Icon = STATUS_ICON[status];
                  return (
                    <Button
                      key={status}
                      variant={status === "NO_SHOW" ? "outline" : "default"}
                      onClick={() => void applyStatus(status)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Icon className="mr-1.5 size-4" />}
                      {t(`detail.actions.${status}`)}
                    </Button>
                  );
                })}
              {transitions.includes("CANCELLED") && (
                <Button variant="outline" onClick={() => setConfirmingCancel(true)} disabled={busy}>
                  <XCircle className="mr-1.5 size-4 text-destructive" />
                  {t("detail.actions.CANCELLED")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}
