"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  DAY_DISPLAY_ORDER,
  DAY_LABELS,
  formatCommission,
  type StaffMember,
} from "@/lib/validators/staff";

/** "2026-09-01T00:00:00.000Z" -> "1 sept 2026", same formatting as AbsenceDialog. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Read-only preview of a professional's full profile (spec: "modal de
 * lectura para ver el perfil completo... sus horarios, servicios que
 * ejecuta y ausencias activas"). Editing still goes through
 * StaffFormDialog — this one has no inputs, just an "Editar" shortcut.
 */
export function StaffDetailDialog({
  open,
  onOpenChange,
  staff,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember | null;
  onEdit: (staff: StaffMember) => void;
}) {
  const t = useTranslations("Staff");
  // Lazy initializer runs once (mount), not on every render — Date.now()
  // itself is impure and can't be called directly in the component body.
  const [now] = useState(() => Date.now());
  if (!staff) return null;

  const fullName = `${staff.firstName} ${staff.lastName}`;
  const byDay = new Map((staff.schedules ?? []).map((entry) => [entry.dayOfWeek, entry]));
  const activeAbsences = (staff.absences ?? []).filter(
    (absence) => new Date(absence.endDate).getTime() >= now,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar size="lg">
                  {staff.avatarUrl ? <AvatarImage src={staff.avatarUrl} alt={fullName} /> : null}
                  <AvatarFallback>
                    {staff.firstName[0]?.toUpperCase()}
                    {staff.lastName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span
                  className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card"
                  style={{ backgroundColor: staff.color ?? "var(--color-muted-foreground)" }}
                  aria-hidden
                />
              </div>
              <div>
                <DialogTitle className="text-lg">{fullName}</DialogTitle>
                <DialogDescription>
                  {staff.specialty?.name ?? t("card.noSpecialty")}
                </DialogDescription>
              </div>
            </div>
            <Badge variant={staff.isActive ? "default" : "secondary"}>
              {staff.isActive ? t("card.active") : t("card.inactive")}
            </Badge>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <DetailBlock title={t("detail.contactTitle")}>
            <DetailRow
              label={t("detail.licenseLabel")}
              value={staff.medicalLicense ?? t("detail.notProvided")}
            />
            <DetailRow label={t("detail.emailLabel")} value={staff.email ?? t("detail.notProvided")} />
            <DetailRow label={t("detail.phoneLabel")} value={staff.phone ?? t("detail.notProvided")} />
            <DetailRow
              label={t("detail.commissionLabel")}
              value={formatCommission(staff.commissionPercentage)}
            />
          </DetailBlock>

          {staff.biography && (
            <DetailBlock title={t("detail.biographyTitle")}>
              <p className="text-sm text-foreground">{staff.biography}</p>
            </DetailBlock>
          )}

          <DetailBlock title={t("detail.scheduleTitle")}>
            {DAY_DISPLAY_ORDER.every((day) => !byDay.has(day)) ? (
              <p className="text-sm text-muted-foreground">{t("detail.noSchedule")}</p>
            ) : (
              DAY_DISPLAY_ORDER.map((dayOfWeek) => {
                const entry = byDay.get(dayOfWeek);
                if (!entry) return null;
                return (
                  <div key={dayOfWeek} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{DAY_LABELS[dayOfWeek]}</span>
                    <span className="font-medium text-foreground">
                      {entry.startTime} – {entry.endTime}
                      {entry.lunchStartTime && entry.lunchEndTime && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({t("form.scheduleLunch")} {entry.lunchStartTime}–{entry.lunchEndTime})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </DetailBlock>

          <DetailBlock title={t("detail.servicesTitle")}>
            {(staff.services ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noServices")}</p>
            ) : (
              staff.services!.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground">{assignment.service.name}</span>
                  <span className="text-muted-foreground">
                    {assignment.customDurationMinutes
                      ? t("detail.customDuration", { minutes: assignment.customDurationMinutes })
                      : t("form.defaultDuration", { minutes: assignment.service.durationMinutes })}
                  </span>
                </div>
              ))
            )}
          </DetailBlock>

          <DetailBlock title={t("detail.absencesTitle")}>
            {activeAbsences.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noAbsences")}</p>
            ) : (
              activeAbsences.map((absence) => (
                <div key={absence.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground">{absence.reason}</span>
                  <span className="text-muted-foreground">
                    {formatDate(absence.startDate)} – {formatDate(absence.endDate)}
                  </span>
                </div>
              ))
            )}
          </DetailBlock>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit(staff);
            }}
          >
            <Pencil className="mr-1.5 size-4" />
            {t("common.edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
