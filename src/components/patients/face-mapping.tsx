"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FaceMappingMarker } from "@/lib/validators/patient";

/** Puntos clave anatómicos (spec Fase 4 §3): frente, entrecejo, patas de
 *  gallo (ambos lados), surcos nasogenianos (ambos lados) y labios.
 *  Coordenadas en porcentaje del viewBox del SVG (0-100), fijas — no son
 *  editables por el usuario, son las zonas clínicamente relevantes para
 *  neurotoxina/rellenos. */
export const FACE_POINTS: Array<{ key: string; labelKey: string; x: number; y: number }> = [
  { key: "forehead", labelKey: "forehead", x: 50, y: 21 },
  { key: "glabella", labelKey: "glabella", x: 50, y: 33 },
  { key: "crowsFeetLeft", labelKey: "crowsFeetLeft", x: 22, y: 34 },
  { key: "crowsFeetRight", labelKey: "crowsFeetRight", x: 78, y: 34 },
  { key: "nasolabialLeft", labelKey: "nasolabialLeft", x: 39, y: 60 },
  { key: "nasolabialRight", labelKey: "nasolabialRight", x: 61, y: 60 },
  { key: "lips", labelKey: "lips", x: 50, y: 73 },
];

/**
 * Visor de Mapeo Facial Interactivo (Fase 4, plan.md "Mapeo Facial/Corporal").
 *
 * Controlado: `value` son los marcadores ya guardados, `onChange` recibe la
 * lista completa cada vez que uno se agrega/edita/borra. Cada punto clave
 * admite un solo marcador — hacer clic en un punto ya marcado abre el mismo
 * popover para editarlo o quitarlo, no apila varios en el mismo lugar.
 */
export function FaceMapping({
  value,
  onChange,
}: {
  value: FaceMappingMarker[];
  onChange: (markers: FaceMappingMarker[]) => void;
}) {
  const t = useTranslations("Patients.detail.clinicalRecords.faceMapping");
  const [openPoint, setOpenPoint] = useState<string | null>(null);
  const [draftUnits, setDraftUnits] = useState("");
  const [draftMl, setDraftMl] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const markerByPoint = new Map(value.map((marker) => [marker.pointKey, marker]));

  function openFor(pointKey: string) {
    const existing = markerByPoint.get(pointKey);
    setDraftUnits(existing?.units !== undefined ? String(existing.units) : "");
    setDraftMl(existing?.ml !== undefined ? String(existing.ml) : "");
    setDraftNote(existing?.note ?? "");
    setOpenPoint(pointKey);
  }

  function save(point: (typeof FACE_POINTS)[number]) {
    const units = draftUnits.trim() ? Number(draftUnits) : undefined;
    const ml = draftMl.trim() ? Number(draftMl) : undefined;
    const note = draftNote.trim() || undefined;
    const marker: FaceMappingMarker = {
      id: markerByPoint.get(point.key)?.id ?? `${point.key}-${crypto.randomUUID()}`,
      pointKey: point.key,
      label: t(`points.${point.labelKey}`),
      units,
      ml,
      note,
      xPct: point.x,
      yPct: point.y,
    };
    const next = value.filter((entry) => entry.pointKey !== point.key);
    next.push(marker);
    onChange(next);
    setOpenPoint(null);
  }

  function remove(pointKey: string) {
    onChange(value.filter((entry) => entry.pointKey !== pointKey));
    setOpenPoint(null);
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-xs rounded-lg border border-border bg-muted/30 p-2">
        <svg viewBox="0 0 100 100" className="size-full">
          {/* Silueta simplificada de rostro — no es un asset médico, solo
              referencia visual para ubicar los puntos clave. */}
          <ellipse cx="50" cy="48" rx="30" ry="38" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1.2" />
          <path d="M 30 40 Q 34 36 38 40" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1" />
          <path d="M 62 40 Q 66 36 70 40" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1" />
          <path d="M 48 48 L 46 58 Q 50 60 54 58" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1" />
          <path d="M 42 72 Q 50 76 58 72" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1" />
        </svg>

        {FACE_POINTS.map((point) => {
          const marker = markerByPoint.get(point.key);
          return (
            <Popover
              key={point.key}
              open={openPoint === point.key}
              onOpenChange={(open) => (open ? openFor(point.key) : setOpenPoint(null))}
            >
              <PopoverTrigger
                className={cn(
                  "absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[9px] font-semibold transition-colors",
                  marker
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/60",
                )}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                aria-label={t(`points.${point.labelKey}`)}
              >
                {marker ? "•" : ""}
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <p className="text-sm font-medium text-foreground">{t(`points.${point.labelKey}`)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`units-${point.key}`} className="text-xs">
                      {t("unitsLabel")}
                    </Label>
                    <Input
                      id={`units-${point.key}`}
                      type="number"
                      min="0"
                      step="0.5"
                      value={draftUnits}
                      onChange={(event) => setDraftUnits(event.target.value)}
                      className="mt-1 h-8"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ml-${point.key}`} className="text-xs">
                      {t("mlLabel")}
                    </Label>
                    <Input
                      id={`ml-${point.key}`}
                      type="number"
                      min="0"
                      step="0.1"
                      value={draftMl}
                      onChange={(event) => setDraftMl(event.target.value)}
                      className="mt-1 h-8"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`note-${point.key}`} className="text-xs">
                    {t("noteLabel")}
                  </Label>
                  <Textarea
                    id={`note-${point.key}`}
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows={2}
                    className="mt-1 text-xs"
                  />
                </div>
                <div className="flex justify-between gap-2">
                  {marker ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(point.key)}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      {t("remove")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button type="button" size="sm" onClick={() => save(point)}>
                    {t("save")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {value.length > 0 && (
        <ul className="space-y-1 text-xs">
          {value.map((marker) => (
            <li key={marker.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
              <span className="font-medium text-foreground">{marker.label}</span>
              <span className="text-muted-foreground">
                {marker.units !== undefined ? t("unitsValue", { units: marker.units }) : ""}
                {marker.units !== undefined && marker.ml !== undefined ? " · " : ""}
                {marker.ml !== undefined ? t("mlValue", { ml: marker.ml }) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
