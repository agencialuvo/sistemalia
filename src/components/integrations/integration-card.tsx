"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { CATEGORY_LABELS, type IntegrationDefinition } from "@/lib/integrations/types";
import { IntegrationStatusBadge } from "./integration-status-badge";

/** Card estándar del Marketplace de Integraciones — CUALQUIER proveedor
 *  (Google Calendar, Meta, WhatsApp, TikTok, futuros) comparte este mismo
 *  formato visual; lo que cambia es solo la `IntegrationDefinition` que
 *  recibe. */
export function IntegrationCard({ integration }: { integration: IntegrationDefinition }) {
  const { name, shortDescription, category, logo, status, connectedSummary, pending, onAction } = integration;
  const isComingSoon = status === "coming_soon";

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            {logo}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            {status === "connected" && connectedSummary && (
              <p className="truncate text-xs text-muted-foreground">{connectedSummary}</p>
            )}
          </div>
        </div>
        <IntegrationStatusBadge status={status} />
      </CardHeader>

      <CardContent className="space-y-2">
        <p className="line-clamp-3 text-sm text-muted-foreground">{shortDescription}</p>
        <Badge variant="outline" className="text-[11px] text-muted-foreground">
          {CATEGORY_LABELS[category]}
        </Badge>
      </CardContent>

      <CardFooter className="border-t-0 bg-transparent px-4 pb-4 pt-0">
        <Button
          className="w-full"
          variant={status === "connected" ? "outline" : status === "error" ? "destructive" : "default"}
          disabled={isComingSoon || pending}
          onClick={onAction}
        >
          {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {isComingSoon
            ? "Próximamente"
            : status === "connected"
              ? "Configurar"
              : status === "error"
                ? "Reconectar"
                : "Conectar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
