"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, Unlink } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SocialChannel } from "@/lib/social-channels/api";
import { cn } from "@/lib/utils";

/**
 * Módulo 10 — Integraciones No-Code (Task 3.2). Una tarjeta por PROVEEDOR
 * (Meta, WhatsApp, TikTok Ads) — no por SocialChannel individual: un tenant
 * puede conectar varias Páginas de Facebook a la vez, así que la tarjeta
 * agrupa todos los `channels` de ese proveedor y los lista adentro, en vez de
 * mostrar una tarjeta por fila de la tabla (mismo criterio que la tarjeta
 * única de Google Calendar en /integraciones, extendido a "N canales" en vez
 * de "conectado sí/no").
 */
export function ChannelCard({
  icon,
  title,
  description,
  channels,
  connecting,
  disconnectingId,
  onConnect,
  onDisconnect,
  connectLabel,
  upcoming = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  channels: SocialChannel[];
  connecting: boolean;
  disconnectingId: string | null;
  onConnect: () => void;
  onDisconnect: (channel: SocialChannel) => void;
  connectLabel: string;
  /** TikTok Ads (Fase 2 del backend todavía no lo implementa) — misma idea
   *  que `NavItem.upcoming` en dashboard-nav.ts: se muestra en el grid como
   *  roadmap, no como un botón roto. */
  upcoming?: boolean;
}) {
  const t = useTranslations("SocialChannels");
  const connected = channels.length > 0;

  return (
    <Card className={cn(upcoming && "opacity-70")}>
      <CardHeader className="border-b border-border/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              {title}
              {connected && (
                <Badge variant="secondary" className="gap-1">
                  <Check className="size-3" />
                  {t("card.connectedBadge", { count: channels.length })}
                </Badge>
              )}
              {upcoming && <Badge variant="outline">{t("card.upcomingBadge")}</Badge>}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {upcoming ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("card.upcomingHelp")}</p>
        ) : (
          <div className="space-y-4">
            {connected && (
              <ul className="space-y-2">
                {channels.map((channel) => {
                  const avatarUrl =
                    typeof channel.metadata?.profilePictureUrl === "string"
                      ? channel.metadata.profilePictureUrl
                      : undefined;
                  return (
                    <li
                      key={channel.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                    >
                      <Avatar size="sm">
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                        <AvatarFallback>{channel.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{channel.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`status.${channel.status}`)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDisconnect(channel)}
                        disabled={disconnectingId !== null}
                        aria-label={t("card.disconnectButton")}
                      >
                        {disconnectingId === channel.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Unlink className="size-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <Button variant={connected ? "outline" : "default"} size="sm" onClick={onConnect} disabled={connecting}>
              {connecting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {connectLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
