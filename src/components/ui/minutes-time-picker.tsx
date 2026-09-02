"use client";

import { useEffect, useMemo, useState } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { es } from "date-fns/locale";

// Registers MuiPickersInputBase/MuiPickersOutlinedInput (and the other
// pickers components) on MUI's `Components<Theme>` type — without this,
// `createTheme({ components: { MuiPickersOutlinedInput: ... } })` below
// doesn't type-check, since @mui/material's own theme type has no idea
// these components from @mui/x-date-pickers exist.
import type {} from "@mui/x-date-pickers/themeAugmentation";

import { useTheme } from "@/hooks/use-theme";

/** Fixed reference date — only the hours/minutes ever get read back, so the
 *  day/month/year are arbitrary and never surface anywhere. */
function referenceDate(): Date {
  return new Date(2000, 0, 1, 0, 0, 0, 0);
}

function minutesToDate(minutes: string | number | undefined): Date | null {
  const total = Math.floor(Number(minutes));
  if (!Number.isFinite(total) || total < 0) return null;
  const date = referenceDate();
  date.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return date;
}

function dateToMinutes(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return String(date.getHours() * 60 + date.getMinutes());
}

/** "HH:mm" <-> Date, para el modo reloj-de-pared (TimeOfDayPicker) — a
 *  diferencia de minutesToDate/dateToMinutes (duración total en minutos),
 *  acá hora y minuto se leen/escriben directo, sin sumar. */
function hhmmToDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = referenceDate();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToHHMM(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface ThemeColors {
  primary: string;
  primaryForeground: string;
  background: string;
  popover: string;
  popoverForeground: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  input: string;
}

/** LIA's default accent (#0328ba) and its light-mode neutrals — used only
 *  until the real values are resolved on mount (see `resolveCssVar` below)
 *  and as a safety net if that resolution ever comes back empty. */
const FALLBACK_COLORS: ThemeColors = {
  primary: "#0328ba",
  primaryForeground: "#ffffff",
  background: "#ffffff",
  popover: "#ffffff",
  popoverForeground: "#0f172a",
  foreground: "#0f172a",
  mutedForeground: "#64748b",
  border: "#e2e8f0",
  input: "#e2e8f0",
};

/**
 * The app's own tokens (`--primary`, `--border`, …) are `oklch()` values on
 * most accents (see src/app/globals.css) — a color space MUI's palette math
 * (`decomposeColor`, used to derive hover/light/dark shades) does not parse,
 * so handing MUI `"var(--primary)"` directly throws "Unsupported color".
 *
 * The fix is the same trick browsers use internally: apply the var to a real
 * element's `color`, then read back `getComputedStyle` — the browser resolves
 * whatever color space the token used into a plain `rgb()`/`rgba()` string,
 * which MUI can decompose fine. Requires the element to be attached to the
 * document (custom properties resolve through the cascade, not in isolation).
 */
function resolveCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return resolved || fallback;
}

function resolveThemeColors(): ThemeColors {
  return {
    primary: resolveCssVar("--primary", FALLBACK_COLORS.primary),
    primaryForeground: resolveCssVar("--primary-foreground", FALLBACK_COLORS.primaryForeground),
    background: resolveCssVar("--background", FALLBACK_COLORS.background),
    popover: resolveCssVar("--popover", FALLBACK_COLORS.popover),
    popoverForeground: resolveCssVar("--popover-foreground", FALLBACK_COLORS.popoverForeground),
    foreground: resolveCssVar("--foreground", FALLBACK_COLORS.foreground),
    mutedForeground: resolveCssVar("--muted-foreground", FALLBACK_COLORS.mutedForeground),
    border: resolveCssVar("--border", FALLBACK_COLORS.border),
    input: resolveCssVar("--input", FALLBACK_COLORS.input),
  };
}

/**
 * Núcleo compartido por `MinutesTimePicker` (duración total en minutos) y
 * `TimeOfDayPicker` (hora de reloj "HH:mm") — ambos son el mismo campo MUI X
 * `TimePicker` con el mismo theming/estilo (spec: usar MUI X Time Pickers en
 * vez del `<input type="time">` nativo, mismo look-and-feel en toda la app),
 * solo cambia cómo se traduce el valor externo hacia/desde el `Date` interno
 * que MUI necesita.
 *
 * Themed from the app's own accent/mode tokens (resolved at runtime, see
 * `resolveThemeColors`) rather than a hardcoded palette: the system has
 * several selectable accent colors plus light/dark mode, and hardcoding one
 * of them here would make the picker drift from whichever the user actually
 * has active.
 */
function TimePickerField({
  id,
  dateValue,
  onDateChange,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  dateValue: Date | null;
  onDateChange: (next: Date | null) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { mode, theme } = useTheme();
  const [colors, setColors] = useState<ThemeColors>(FALLBACK_COLORS);
  // Controlled open state so a click ANYWHERE on the field opens the picker
  // (spec: not just the clock icon) — MUI's own toggle only fires from its
  // adornment button, so the text field needs its own onClick wired in below.
  const [open, setOpen] = useState(false);

  // Re-resolve whenever the accent or light/dark mode changes — both mutate
  // the CSS custom properties on <html>, which resolveCssVar has to read
  // fresh each time rather than once on mount. Genuinely a read from an
  // external system (getComputedStyle on the DOM), not derivable state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColors(resolveThemeColors());
  }, [mode, theme]);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: mode === "dark" ? "dark" : "light",
          primary: { main: colors.primary, contrastText: colors.primaryForeground },
          background: { paper: colors.popover, default: colors.background },
          text: { primary: colors.foreground, secondary: colors.mutedForeground },
          divider: colors.border,
        },
        // --radius-lg (the plain <Input>'s rounded-lg) resolves to 10px at
        // the default root font-size, not MUI's 8px default.
        shape: { borderRadius: 10 },
        typography: { fontFamily: "inherit" },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: { color: colors.popoverForeground },
            },
          },
          // The clock-icon toggle button rendered inside the field's end
          // adornment — MUI's default padding makes it visually oversized
          // next to the rest of the app's compact 32px-tall inputs.
          MuiIconButton: {
            styleOverrides: {
              root: { padding: "4px 8px" },
            },
          },
          // MuiFormControl wrapper around the whole field — nudges it down
          // to clear the <Label> rendered above it (same gap the plain
          // <Input> gets from its own "mt-1.5" className).
          MuiPickersTextField: {
            styleOverrides: {
              root: { marginTop: "6px" },
            },
          },
          // Each selectable hour/minute row in the popup's scrollable list
          // (built on MuiMenuItem — class combines both names).
          MuiMultiSectionDigitalClockSection: {
            styleOverrides: {
              item: { fontSize: "15px" },
            },
          },
          // @mui/x-date-pickers v7+ stopped using @mui/material's
          // MuiOutlinedInput for its text field — it renders its own
          // MuiPickersInputBase (base sizing/typography, shared by every
          // variant) wrapped by MuiPickersOutlinedInput (the outlined
          // variant's border/notch). Styling MuiOutlinedInput here (the old
          // approach) silently did nothing because the picker never mounts
          // that component.
          MuiPickersInputBase: {
            styleOverrides: {
              root: {
                // h-8 — the plain <Input> is a fixed 32px tall regardless of
                // its padding/line-height math; pin the picker to the same.
                height: 32,
                boxSizing: "border-box",
                fontSize: "var(--text-sm)",
                fontWeight: 400,
              },
              sectionsContainer: { padding: "4px 0", fontSize: "inherit" },
            },
          },
          MuiPickersOutlinedInput: {
            styleOverrides: {
              // Padding mirrors the app's plain <Input> (h-8's px-2.5 py-1
              // = 10px/4px) — this is the one input in the form backed by
              // MUI rather than that shared component, so it has to be
              // pinned by hand.
              root: {
                padding: "0 10px",
                backgroundColor:
                  mode === "dark" ? "color-mix(in oklch, var(--input) 30%, transparent)" : "transparent",
                // <Input>'s focus-visible state swaps the border for
                // --ring and adds an outer ring shadow instead of MUI's
                // default 2px-border jump — same visual language here.
                "&.Mui-focused .MuiPickersOutlinedInput-notchedOutline": {
                  borderColor: "var(--ring)",
                  borderWidth: 1,
                },
                "&.Mui-focused": {
                  boxShadow: "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)",
                },
                // Mirrors <Input>'s disabled:bg-input/50 disabled:opacity-50
                // (dark:disabled:bg-input/80) instead of MUI's own greyscale.
                "&.Mui-disabled": {
                  backgroundColor:
                    mode === "dark"
                      ? "color-mix(in oklch, var(--input) 80%, transparent)"
                      : "color-mix(in oklch, var(--input) 50%, transparent)",
                  opacity: 0.5,
                  cursor: "not-allowed",
                },
              },
              notchedOutline: { borderColor: colors.input },
            },
          },
        },
      }),
    [mode, colors],
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
        <TimePicker
          value={dateValue}
          onChange={onDateChange}
          ampm={false}
          // MUI's default is 5-minute increments (00, 05, 10…) — a normal
          // time picker where every minute is selectable, per spec.
          timeSteps={{ hours: 1, minutes: 1 }}
          disabled={disabled}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          // Applies the moment the minutes are picked instead of waiting for
          // an "Aceptar" click — pairs with the empty actionBar below.
          closeOnSelect
          slotProps={{
            textField: {
              id,
              size: "small",
              fullWidth: true,
              className,
              onClick: () => setOpen(true),
              "aria-label": ariaLabel,
            },
            // Removes the "Cancelar"/"Aceptar" bar under the clock — the
            // value already applies live via onChange as each click lands.
            actionBar: { actions: [] },
          }}
        />
      </LocalizationProvider>
    </ThemeProvider>
  );
}

/**
 * Duración total en minutos (ej. 45, 60) — usado por Servicios (Duración,
 * Buffer). El reloj se lee como "00:45" pero el valor externo es un entero
 * de minutos, no una hora del día.
 */
export function MinutesTimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (minutes: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TimePickerField
      id={id}
      dateValue={minutesToDate(value)}
      onDateChange={(next) => onChange(dateToMinutes(next))}
      disabled={disabled}
      className={className}
    />
  );
}

/**
 * Hora de reloj como "HH:mm" (ej. "09:00", "18:30") — mismo campo MUI X que
 * MinutesTimePicker (mismo estilo/funcionalidad, spec: "todos los input tipo
 * time"), pero para horarios reales en vez de una duración: horario laboral,
 * turnos y descansos de Personal, franjas de sucursal en el onboarding, etc.
 * `value: ""` = sin hora (campo vacío, válido para un descanso opcional).
 */
export function TimeOfDayPicker({
  id,
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <TimePickerField
      id={id}
      dateValue={hhmmToDate(value)}
      onDateChange={(next) => onChange(dateToHHMM(next))}
      disabled={disabled}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}
