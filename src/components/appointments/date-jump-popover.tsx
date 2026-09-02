"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addMonths, monthMatrixDays, monthYearEs } from "@/lib/appointments/date-helpers";
import { todayDateOnly } from "@/lib/validators/appointment";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS_ES = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Mini-calendario (spec §3.2) para saltar directo a una fecha — complementa
 * la navegación por flechas ya existente en la página (no la reemplaza).
 */
export function DateJumpPopover({
  trigger,
  date,
  onSelectDate,
}: {
  trigger: ReactElement;
  /** "YYYY-MM-DD" actualmente activo — ancla el mes que se muestra al abrir. */
  date: string;
  onSelectDate: (dateOnly: string) => void;
}) {
  const t = useTranslations("Appointments.dateJump");
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(date);

  /** Reinicia el mes visible al abrir (en vez de un useEffect sincronizando
   *  `open`) para no disparar un set-state dentro de un efecto. */
  function handleOpenChange(next: boolean) {
    if (next) setVisibleMonth(date);
    setOpen(next);
  }

  const monthPrefix = visibleMonth.slice(0, 7);
  const today = todayDateOnly();
  const days = monthMatrixDays(visibleMonth);

  function handleDayClick(day: string) {
    onSelectDate(day);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-72" sideOffset={8}>
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm font-medium text-foreground">{monthYearEs(visibleMonth)}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
          {WEEKDAY_LABELS_ES.map((label, index) => (
            <span key={`${label}-${index}`} className="py-1 font-medium">
              {label}
            </span>
          ))}
          {days.map((day) => {
            const inCurrentMonth = day.slice(0, 7) === monthPrefix;
            const isToday = day === today;
            const isSelected = day === date;
            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                className={cn(
                  "rounded-md py-1 text-xs transition-colors hover:bg-muted",
                  !inCurrentMonth && "text-muted-foreground/40",
                  isToday && "font-semibold text-primary",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {Number(day.slice(8, 10))}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-border/80 pt-2.5">
          <Button variant="outline" size="sm" onClick={() => handleDayClick(today)}>
            {t("today")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
