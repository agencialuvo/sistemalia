"use client";

import { useTranslations } from "next-intl";
import {
  CalendarOff,
  ConciergeBell,
  Eye,
  MoreVertical,
  Pencil,
  Power,
  Trash2,
  User,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DAY_ABBR, DAY_DISPLAY_ORDER, formatCommission, type StaffMember } from "@/lib/validators/staff";
import { cn } from "@/lib/utils";

/** Cards render in a fixed-width grid column — a long nombre + apellido
 *  combo (varios nombres compuestos) can still overflow the CSS `truncate`
 *  ellipsis awkwardly at some breakpoints, so the text itself is capped. */
const MAX_CARD_NAME_LENGTH = 20;

function truncateName(name: string): string {
  return name.length > MAX_CARD_NAME_LENGTH ? `${name.slice(0, MAX_CARD_NAME_LENGTH)}...` : name;
}

export function StaffCard({
  staff,
  onView,
  onEdit,
  onManageServices,
  onManageAbsences,
  onToggleActive,
  onDelete,
  selected,
  onToggleSelected,
  busy,
}: {
  staff: StaffMember;
  /** Opens the read-only preview — fired by clicking anywhere on the card
   *  that isn't the checkbox or the options menu. */
  onView: (staff: StaffMember) => void;
  onEdit: (staff: StaffMember) => void;
  /** Opens StaffFormDialog straight on its "Servicios habilitados" tab —
   *  mirrors ServiceCard's onManageStaff, which lands on the equivalent
   *  "Personal Asignado" tab from the other side of the same relationship. */
  onManageServices: (staff: StaffMember) => void;
  onManageAbsences: (staff: StaffMember) => void;
  onToggleActive: (staff: StaffMember) => void;
  /** Opens the hard-delete confirmation — distinct from onToggleActive,
   *  which is the existing soft deactivate/reactivate. */
  onDelete: (staff: StaffMember) => void;
  selected: boolean;
  onToggleSelected: (staff: StaffMember, checked: boolean) => void;
  busy: boolean;
}) {
  const t = useTranslations("Staff");
  const fullName = `${staff.firstName} ${staff.lastName}`;
  const activeDays = new Set((staff.schedules ?? []).map((entry) => entry.dayOfWeek));
  const badgeColor = staff.color ?? "var(--color-muted-foreground)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView(staff)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView(staff);
        }
      }}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-md",
        !staff.isActive && "opacity-70",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onToggleSelected(staff, checked === true)}
              className="absolute -left-1.5 -top-1.5 z-10 bg-background/90 backdrop-blur"
              aria-label={t("card.select")}
            />
            <Avatar size="lg">
              {staff.avatarUrl ? <AvatarImage src={staff.avatarUrl} alt={fullName} /> : null}
              <AvatarFallback>
                {staff.firstName[0]?.toUpperCase()}
                {staff.lastName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card"
              style={{ backgroundColor: badgeColor }}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground" title={fullName}>
              {truncateName(fullName)}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {staff.specialty?.name ?? t("card.noSpecialty")}
            </p>
          </div>
        </div>

        <div onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted disabled:opacity-50"
              aria-label={t("card.options")}
              disabled={busy}
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(staff)}>
                <Eye className="mr-2 size-4" />
                {t("card.viewDetail")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(staff)}>
                <Pencil className="mr-2 size-4" />
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onManageServices(staff)}>
                <ConciergeBell className="mr-2 size-4" />
                {t("card.manageServices")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onManageAbsences(staff)}>
                <CalendarOff className="mr-2 size-4" />
                {t("card.manageAbsences")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(staff)}>
                <Power className="mr-2 size-4" />
                {staff.isActive ? t("card.deactivate") : t("card.reactivate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(staff)} variant="destructive">
                <Trash2 className="mr-2 size-4" />
                {t("card.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {staff.medicalLicense && (
          <span className="flex items-center gap-1">
            <User className="size-3.5" />
            {staff.medicalLicense}
          </span>
        )}
        <span className="flex items-center gap-1">
          <ConciergeBell className="size-3.5" />
          {t("card.serviceCount", { count: staff._count?.services ?? staff.services?.length ?? 0 })}
        </span>
        {staff.commissionPercentage && (
          <span>{t("card.commission", { value: formatCommission(staff.commissionPercentage) })}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {DAY_DISPLAY_ORDER.map((dayOfWeek) => (
          <span
            key={dayOfWeek}
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-[10px] font-medium",
              activeDays.has(dayOfWeek)
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground/60",
            )}
            title={DAY_ABBR[dayOfWeek]}
          >
            {DAY_ABBR[dayOfWeek][0]}
          </span>
        ))}
      </div>

      <div>
        <Badge variant={staff.isActive ? "default" : "secondary"}>
          {staff.isActive ? t("card.active") : t("card.inactive")}
        </Badge>
      </div>
    </div>
  );
}
