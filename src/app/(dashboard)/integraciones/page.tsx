"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calendar, Check, Loader2, MessageCircle, Music2, RefreshCw, Share2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ChannelCard } from "@/components/marketing/channel-card";
import { IntegrationsHeader, type IntegrationTab } from "@/components/integrations/integrations-header";
import { IntegrationsGrid } from "@/components/integrations/integrations-grid";
import type { IntegrationDefinition } from "@/lib/integrations/types";
import { getApiErrorMessage } from "@/lib/api";
import {
  disconnectGoogleCalendar,
  getGoogleConnectUrl,
  getGoogleIntegrationStatus,
  listGoogleCalendars,
  selectGoogleParentCalendar,
  type GoogleCalendar,
  type GoogleIntegrationStatus,
} from "@/lib/integrations/google-calendar";
import {
  connectMetaChannel,
  connectWhatsAppChannel,
  disconnectSocialChannel,
  listSocialChannels,
  type SocialChannel,
} from "@/lib/social-channels/api";
import { loginForMetaPages, loginForWhatsAppSignup } from "@/lib/social-channels/meta-sdk";

const WHATSAPP_CONFIG_ID = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID;

type SettingsView = "google" | "meta" | "whatsapp" | null;

// `useSearchParams` opts this page out of static prerendering unless it sits
// under a Suspense boundary — mismo motivo que /ajustes/page.tsx.
//
// Marketplace unificado de Integraciones (rediseño a pedido del usuario):
// Google Calendar (Módulo 09) y los canales de Meta/WhatsApp/TikTok (Módulo
// 10, antes en /marketing/canales) son ahora 4 `IntegrationDefinition` en un
// mismo grid de cards estandarizadas (ver src/lib/integrations/types.ts) con
// búsqueda + tabs de categoría — en vez de dos secciones con layouts
// distintos. Toda la lógica de conexión (OAuth de Google, SDK de Meta,
// Embedded Signup de WhatsApp) es la misma de antes, sin cambios: lo único
// que cambió es CÓMO se presenta. Cada integración "Conectada" abre su
// propio panel de configuración en un Dialog (`settingsView`) en vez de
// mostrar sus controles siempre expandidos en la página.
export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageInner />
    </Suspense>
  );
}

function IntegrationsPageInner() {
  const t = useTranslations("Integrations");
  const tChannels = useTranslations("SocialChannels");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<IntegrationTab>("all");
  const [settingsView, setSettingsView] = useState<SettingsView>(null);

  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [disconnectingChannelId, setDisconnectingChannelId] = useState<string | null>(null);
  const [disconnectChannelTarget, setDisconnectChannelTarget] = useState<SocialChannel | null>(null);

  const refreshChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      setChannels(await listSocialChannels());
    } catch (error) {
      toast.error(getApiErrorMessage(error, tChannels("loadFailed")));
    } finally {
      setChannelsLoading(false);
    }
  }, [tChannels]);

  useEffect(() => {
    void refreshChannels();
  }, [refreshChannels]);

  async function handleConnectMeta() {
    setConnectingMeta(true);
    try {
      const response = await loginForMetaPages();
      const accessToken = response.authResponse?.accessToken;
      if (response.status !== "connected" || !accessToken) {
        toast.error(tChannels("meta.loginCancelled"));
        return;
      }
      await connectMetaChannel(accessToken);
      toast.success(tChannels("meta.connectSuccess"));
      await refreshChannels();
    } catch (error) {
      toast.error(getApiErrorMessage(error, tChannels("meta.connectFailed")));
    } finally {
      setConnectingMeta(false);
    }
  }

  async function handleConnectWhatsApp() {
    if (!WHATSAPP_CONFIG_ID) {
      toast.error(tChannels("whatsapp.notConfigured"));
      return;
    }
    setConnectingWhatsApp(true);
    try {
      const { code, wabaId, phoneNumberId } = await loginForWhatsAppSignup(WHATSAPP_CONFIG_ID);
      await connectWhatsAppChannel({ code, wabaId, phoneNumberId });
      toast.success(tChannels("whatsapp.connectSuccess"));
      await refreshChannels();
    } catch (error) {
      toast.error(getApiErrorMessage(error, tChannels("whatsapp.connectFailed")));
    } finally {
      setConnectingWhatsApp(false);
    }
  }

  async function confirmDisconnectChannel() {
    if (!disconnectChannelTarget) return;
    setDisconnectingChannelId(disconnectChannelTarget.id);
    try {
      await disconnectSocialChannel(disconnectChannelTarget.id);
      toast.success(tChannels("disconnectSuccess", { name: disconnectChannelTarget.name }));
      setDisconnectChannelTarget(null);
      await refreshChannels();
    } catch (error) {
      toast.error(getApiErrorMessage(error, tChannels("disconnectFailed")));
    } finally {
      setDisconnectingChannelId(null);
    }
  }

  const metaChannels = channels.filter(
    (channel) => channel.provider === "META_FACEBOOK" || channel.provider === "META_INSTAGRAM",
  );
  const whatsAppChannels = channels.filter((channel) => channel.provider === "WHATSAPP_OFFICIAL");

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getGoogleIntegrationStatus());
    } catch {
      setStatus({ connected: false, syncEnabled: false, parentCalendarId: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  /** Limpia `?googleCalendar=...` de la URL tras manejarlo, para que un
   *  refresh de la página no vuelva a disparar el modal/toast. */
  const clearCallbackParam = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("googleCalendar");
    const query = params.toString();
    router.replace(query ? `/integraciones?${query}` : "/integraciones", { scroll: false });
  }, [router, searchParams]);

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      setCalendars(await listGoogleCalendars());
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("calendarsLoadFailed")));
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const callback = searchParams.get("googleCalendar");
    if (!callback) return;

    if (callback === "connected") {
      toast.success(t("connectSuccess"));
      void refreshStatus();
      setSettingsView("google");
      void openPicker();
    } else if (callback === "error") {
      toast.error(t("connectFailed"));
    }
    clearCallbackParam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function connect() {
    setConnecting(true);
    try {
      const url = await getGoogleConnectUrl();
      window.location.href = url;
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("connectFailed")));
      setConnecting(false);
    }
  }

  async function selectParent(calendarId: string) {
    setSelectingId(calendarId);
    try {
      await selectGoogleParentCalendar(calendarId);
      toast.success(t("parentSelected"));
      setPickerOpen(false);
      await refreshStatus();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("parentSelectFailed")));
    } finally {
      setSelectingId(null);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await disconnectGoogleCalendar();
      toast.success(t("disconnected"));
      setDisconnectOpen(false);
      setSettingsView(null);
      await refreshStatus();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("disconnectFailed")));
    } finally {
      setDisconnecting(false);
    }
  }

  const activeCalendar = calendars.find((calendar) => calendar.id === status?.parentCalendarId);

  // ---------------------------------------------------------------------
  // Registro del marketplace — una IntegrationDefinition por proveedor.
  // ---------------------------------------------------------------------
  const integrations: IntegrationDefinition[] = useMemo(
    () => [
      {
        id: "google-calendar",
        name: t("googleCalendar.title"),
        shortDescription: t("googleCalendar.description"),
        category: "scheduling",
        logo: <Calendar className="size-5 text-primary" />,
        status: status?.connected ? "connected" : "not_connected",
        connectedSummary: status?.connected
          ? status.parentCalendarId
            ? (activeCalendar?.summary ?? t("googleCalendar.parentCalendarLabel"))
            : t("googleCalendar.noParentSelected")
          : undefined,
        pending: connecting,
        onAction: () => (status?.connected ? setSettingsView("google") : void connect()),
      },
      {
        id: "meta",
        name: tChannels("meta.title"),
        shortDescription: tChannels("meta.description"),
        category: "messaging",
        logo: <Share2 className="size-5 text-primary" />,
        status: metaChannels.length > 0 ? "connected" : "not_connected",
        connectedSummary:
          metaChannels.length > 0
            ? tChannels("card.connectedBadge", { count: metaChannels.length })
            : undefined,
        pending: connectingMeta,
        onAction: () => (metaChannels.length > 0 ? setSettingsView("meta") : void handleConnectMeta()),
      },
      {
        id: "whatsapp",
        name: tChannels("whatsapp.title"),
        shortDescription: tChannels("whatsapp.description"),
        category: "messaging",
        logo: <MessageCircle className="size-5 text-primary" />,
        status: whatsAppChannels.length > 0 ? "connected" : "not_connected",
        connectedSummary:
          whatsAppChannels.length > 0
            ? tChannels("card.connectedBadge", { count: whatsAppChannels.length })
            : undefined,
        pending: connectingWhatsApp,
        onAction: () => (whatsAppChannels.length > 0 ? setSettingsView("whatsapp") : void handleConnectWhatsApp()),
      },
      {
        id: "tiktok-ads",
        name: tChannels("tiktok.title"),
        shortDescription: tChannels("tiktok.description"),
        category: "ads",
        logo: <Music2 className="size-5 text-primary" />,
        status: "coming_soon",
        onAction: () => {},
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tChannels, status, connecting, metaChannels.length, connectingMeta, whatsAppChannels.length, connectingWhatsApp],
  );

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((integration) => {
      const matchesTab =
        activeTab === "all"
          ? true
          : activeTab === "connected"
            ? integration.status === "connected"
            : integration.category === activeTab;
      const matchesSearch =
        !search.trim() || integration.name.toLowerCase().includes(search.trim().toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [integrations, activeTab, search]);

  const pageLoading = loading || channelsLoading;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <IntegrationsHeader search={search} onSearchChange={setSearch} activeTab={activeTab} onTabChange={setActiveTab} />

      {pageLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <IntegrationsGrid integrations={filteredIntegrations} />
      )}

      {/* ------------------------------------------------------------- */}
      {/* Panel de configuración — Google Calendar                      */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={settingsView === "google"} onOpenChange={(open) => !open && setSettingsView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("googleCalendar.title")}
              {status?.connected && status.syncEnabled && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" />
                  {t("googleCalendar.activeBadge")}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>{t("googleCalendar.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("googleCalendar.parentCalendarLabel")}</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {status?.parentCalendarId
                  ? (activeCalendar?.summary ?? status.parentCalendarId)
                  : t("googleCalendar.noParentSelected")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void openPicker()}>
                <RefreshCw className="mr-1.5 size-3.5" />
                {status?.parentCalendarId ? t("googleCalendar.changeCalendar") : t("googleCalendar.chooseCalendar")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDisconnectOpen(true)}>
                <Unlink className="mr-1.5 size-3.5" />
                {t("googleCalendar.disconnectButton")}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsView(null)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* Panel de configuración — Meta / WhatsApp (reusa ChannelCard,   */}
      {/* que ya trae la lista de canales conectados + desconexión).    */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={settingsView === "meta"} onOpenChange={(open) => !open && setSettingsView(null)}>
        <DialogContent className="sm:max-w-md">
          {/* ChannelCard ya trae su propio header visual (icono/título/
              descripción) — DialogTitle queda solo para accesibilidad. */}
          <DialogTitle className="sr-only">{tChannels("meta.title")}</DialogTitle>
          <ChannelCard
            icon={<Share2 className="size-5 text-primary" />}
            title={tChannels("meta.title")}
            description={tChannels("meta.description")}
            channels={metaChannels}
            connecting={connectingMeta}
            disconnectingId={disconnectingChannelId}
            onConnect={() => void handleConnectMeta()}
            onDisconnect={setDisconnectChannelTarget}
            connectLabel={tChannels("meta.connectButton")}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={settingsView === "whatsapp"} onOpenChange={(open) => !open && setSettingsView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">{tChannels("whatsapp.title")}</DialogTitle>
          <ChannelCard
            icon={<MessageCircle className="size-5 text-primary" />}
            title={tChannels("whatsapp.title")}
            description={tChannels("whatsapp.description")}
            channels={whatsAppChannels}
            connecting={connectingWhatsApp}
            disconnectingId={disconnectingChannelId}
            onConnect={() => void handleConnectWhatsApp()}
            onDisconnect={setDisconnectChannelTarget}
            connectLabel={tChannels("whatsapp.connectButton")}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={disconnectChannelTarget !== null}
        onOpenChange={(open) => !open && setDisconnectChannelTarget(null)}
        title={tChannels("disconnectDialog.title", { name: disconnectChannelTarget?.name ?? "" })}
        description={tChannels("disconnectDialog.description")}
        loading={disconnectingChannelId !== null}
        onConfirm={() => void confirmDisconnectChannel()}
        cancelLabel={tChannels("common.cancel")}
        confirmLabel={tChannels("disconnectDialog.confirm")}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("picker.title")}</DialogTitle>
            <DialogDescription>{t("picker.description")}</DialogDescription>
          </DialogHeader>

          {pickerLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : calendars.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("picker.empty")}</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {calendars.map((calendar) => (
                <li key={calendar.id}>
                  <button
                    type="button"
                    onClick={() => void selectParent(calendar.id)}
                    disabled={selectingId !== null}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {calendar.summary}
                      {calendar.primary && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{t("picker.primaryTag")}</span>
                      )}
                    </span>
                    {selectingId === calendar.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : status?.parentCalendarId === calendar.id ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={t("disconnectDialog.title")}
        description={t("disconnectDialog.description")}
        loading={disconnecting}
        onConfirm={() => void disconnect()}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("disconnectDialog.confirm")}
      />
    </div>
  );
}
