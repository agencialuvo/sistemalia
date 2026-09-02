"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarCheck2, CalendarOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getGoogleIntegrationStatus } from "@/lib/integrations/google-calendar";

/**
 * Indicador discreto en la barra superior de la Agenda (Módulo 09 Fase 3,
 * Task 3) — no bloquea nada, solo avisa si la sincronización con Google
 * Calendar está activa o si todavía falta configurarla, con un link directo
 * a /integraciones. Silencioso ante error (mismo criterio que un badge
 * informativo, no una alerta): si el status no carga, no muestra nada en vez
 * de romper la barra de la Agenda.
 */
export function GoogleSyncIndicator() {
  const t = useTranslations("Integrations");
  const [syncEnabled, setSyncEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGoogleIntegrationStatus()
      .then((status) => {
        if (!cancelled) setSyncEnabled(status.connected && status.syncEnabled);
      })
      .catch(() => {
        if (!cancelled) setSyncEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (syncEnabled === null) return null;

  return (
    <Link href="/integraciones">
      <Badge
        variant="outline"
        className={
          syncEnabled
            ? "gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        }
      >
        {syncEnabled ? <CalendarCheck2 className="size-3" /> : <CalendarOff className="size-3" />}
        {syncEnabled ? t("indicator.active") : t("indicator.setupNeeded")}
      </Badge>
    </Link>
  );
}
