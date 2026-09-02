"use client";

import { FACE_POINTS } from "@/components/patients/face-mapping";
import type { FaceMappingMarker } from "@/lib/validators/patient";

/**
 * Miniatura de solo lectura del Mapeo Facial (spec §4: "resumen visual del
 * Mapeo Facial" en la tarjeta de la atención) — mismo SVG base y coordenadas
 * de FACE_POINTS que el visor interactivo (face-mapping.tsx), pero sin
 * Popover ni edición: cada marcador es un punto con un `<title>` nativo para
 * el tooltip de unidades/ml.
 */
export function FaceMappingSummary({ markers }: { markers: FaceMappingMarker[] }) {
  const markerByPoint = new Map(markers.map((marker) => [marker.pointKey, marker]));

  return (
    <div className="relative mx-auto aspect-[4/5] w-24 shrink-0 rounded-md border border-border bg-muted/30 p-1">
      <svg viewBox="0 0 100 100" className="size-full">
        <ellipse cx="50" cy="48" rx="30" ry="38" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1.5" />
        <path d="M 30 40 Q 34 36 38 40" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1.2" />
        <path d="M 62 40 Q 66 36 70 40" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1.2" />
        <path d="M 48 48 L 46 58 Q 50 60 54 58" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1.2" />
        <path d="M 42 72 Q 50 76 58 72" fill="none" stroke="currentColor" className="text-muted-foreground/40" strokeWidth="1.2" />
      </svg>

      {FACE_POINTS.map((point) => {
        const marker = markerByPoint.get(point.key);
        if (!marker) return null;
        return (
          <span
            key={point.key}
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-primary"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <title>
              {marker.label}
              {marker.units !== undefined ? ` · ${marker.units} U` : ""}
              {marker.ml !== undefined ? ` · ${marker.ml} ml` : ""}
            </title>
          </span>
        );
      })}
    </div>
  );
}
