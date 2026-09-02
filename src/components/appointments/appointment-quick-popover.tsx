"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CreditCard, Loader2, Pencil, Phone, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { cancelAppointment } from "@/lib/appointments/api";
import {
  APPOINTMENT_PAYMENT_STATUS_COLORS,
  APPOINTMENT_PAYMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  formatDateUtc,
  formatTimeUtc,
  type Appointment,
} from "@/lib/validators/appointment";

const TERMINAL_STATUSES = new Set(["CANCELLED", "COMPLETED", "NO_SHOW"]);

/**
 * Popover flotante estilo Google Calendar (spec "Modales Popover"): resumen
 * rápido de la cita + tres acciones (Editar, Cancelar, Cobrar) sin necesidad
 * de abrir el modal de detalle completo. `trigger` es el elemento clickeable
 * que abre el popover — la tarjeta de la cita, ya sea en AgendaGrid o en la
 * vista de lista — envuelto vía el patrón `render` de Base UI en vez de un
 * `onClick` propio, así conserva sus props originales (drag listeners,
 * clases, etc.).
 */
export function AppointmentQuickPopover({
  appointment,
  trigger,
  onEdit,
  onChanged,
}: {
  appointment: Appointment;
  trigger: ReactElement;
  /** Abre el modal de edición completo (AppointmentDetailDialog) — el
   *  popover se cierra primero para no dejar dos capas flotantes abiertas. */
  onEdit: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("Appointments");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    if (busy) return;
    if (!next) {
      setConfirmingCancel(false);
      setCancelReason("");
    }
    setOpen(next);
  }

  function handleEdit() {
    setOpen(false);
    onEdit();
  }

  async function confirmCancel() {
    setBusy(true);
    try {
      await cancelAppointment(appointment.id, cancelReason.trim() || undefined);
      toast.success(t("detail.statusChanged.CANCELLED"));
      setConfirmingCancel(false);
      setCancelReason("");
      setOpen(false);
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("detail.statusChangeFailed")));
    } finally {
      setBusy(false);
    }
  }

  function goToCashier() {
    setOpen(false);
    router.push(`/ventas?appointmentId=${appointment.id}`);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-80" sideOffset={8}>
        {confirmingCancel ? (
          <div className="space-y-2.5">
            <p className="text-sm font-medium text-foreground">{t("quick.cancelTitle")}</p>
            <div className="space-y-1.5">
              <Label htmlFor={`quick-cancel-reason-${appointment.id}`}>{t("detail.cancelReasonLabel")}</Label>
              <Textarea
                id={`quick-cancel-reason-${appointment.id}`}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={t("detail.cancelReasonPlaceholder")}
                rows={2}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)} disabled={busy}>
                {t("wizard.back")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmCancel()} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {t("detail.confirmCancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {appointment.patient.firstName} {appointment.patient.lastName}
                </p>
                {appointment.patient.phone && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Phone className="size-3 shrink-0" />
                    {appointment.patient.phone}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant="outline" className={APPOINTMENT_STATUS_COLORS[appointment.status]}>
                  {APPOINTMENT_STATUS_LABELS[appointment.status]}
                </Badge>
                <Badge variant="outline" className={APPOINTMENT_PAYMENT_STATUS_COLORS[appointment.paymentStatus]}>
                  {APPOINTMENT_PAYMENT_STATUS_LABELS[appointment.paymentStatus]}
                </Badge>
              </div>
            </div>

            <div className="space-y-1 border-t border-border/80 pt-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{appointment.service.name}</p>
              <p>
                {formatDateUtc(appointment.startAt)} · {formatTimeUtc(appointment.startAt)}–
                {formatTimeUtc(appointment.endAt)}
              </p>
              <p>
                {t("detail.staff")}: {appointment.staffMember.firstName} {appointment.staffMember.lastName}
              </p>
              {appointment.room && (
                <p>
                  {t("detail.room")}: {appointment.room.name}
                </p>
              )}
              {appointment.equipment && (
                <p>
                  {t("detail.equipment")}: {appointment.equipment.name}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 border-t border-border/80 pt-2.5">
              <Button size="sm" variant="outline" onClick={handleEdit}>
                <Pencil className="mr-1.5 size-3.5" />
                {t("quick.edit")}
              </Button>
              {!TERMINAL_STATUSES.has(appointment.status) && (
                <Button size="sm" variant="outline" onClick={() => setConfirmingCancel(true)}>
                  <XCircle className="mr-1.5 size-3.5 text-destructive" />
                  {t("quick.cancel")}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={goToCashier}>
                <CreditCard className="mr-1.5 size-3.5" />
                {t("quick.charge")}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
