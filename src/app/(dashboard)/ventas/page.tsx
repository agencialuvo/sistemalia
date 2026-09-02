"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { CashRegisterTab } from "@/components/sales/cash-register-tab";
import { HistoryTab } from "@/components/sales/history-tab";
import { PosTab } from "@/components/sales/pos-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * /ventas — Módulo 08, Fase 3 (Task 3.1). Las tres pestañas (POS, Caja
 * Chica, Historial) comparten el mismo `refreshKey`: cobrar en el POS
 * también mueve la caja y aparece en el historial, así que cualquier
 * acción que cambie una bombea a las otras dos.
 *
 * `?appointmentId=...` (llegado desde el botón "Cobrar / Ver en Caja" del
 * popover de citas de la Agenda) precarga esa cita en el carrito del POS —
 * ver PosTab's `initialAppointmentId`. `useSearchParams` exige un límite
 * Suspense o el build de producción cae a CSR y falla (mismo patrón que
 * /bandeja).
 */
export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesPageInner />
    </Suspense>
  );
}

function SalesPageInner() {
  const t = useTranslations("Sales");
  const searchParams = useSearchParams();
  const initialAppointmentId = searchParams.get("appointmentId") ?? undefined;

  /** Se incrementa tras cualquier acción que mueva el estado de la caja
   *  (abrir, cerrar, movimiento manual, cobro) para que ambas pestañas —
   *  que administran su propia carga de datos — vuelvan a pedirla. */
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefreshKey = useCallback(() => setRefreshKey((key) => key + 1), []);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Tabs defaultValue="pos">
        <TabsList variant="line">
          <TabsTrigger value="pos">{t("tabs.pos")}</TabsTrigger>
          <TabsTrigger value="cash-register">{t("tabs.cashRegister")}</TabsTrigger>
          <TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="mt-5">
          <PosTab refreshKey={refreshKey} onCompleted={bumpRefreshKey} initialAppointmentId={initialAppointmentId} />
        </TabsContent>
        <TabsContent value="cash-register" className="mt-5">
          <CashRegisterTab refreshKey={refreshKey} onChanged={bumpRefreshKey} />
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          <HistoryTab refreshKey={refreshKey} onChanged={bumpRefreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
