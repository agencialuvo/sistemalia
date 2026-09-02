"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  formatSolesAmount,
  INVOICE_TYPE_LABELS,
  invoiceCustomerLabel,
  invoiceNumberLabel,
  PAYMENT_METHOD_LABELS,
  type InvoiceDetail,
} from "@/lib/validators/sales";

/**
 * Vista previa del comprobante en formato Ticket Térmico 80mm (Módulo 08
 * Fase 3, Task 3.2). Se abre inmediatamente al completar un cobro en el POS
 * o desde "Ver" en el Historial de Ventas — misma prop shape en ambos
 * lugares (`invoice: InvoiceDetail | null`).
 *
 * El truco de impresión es el estándar de "aislar un nodo": @media print
 * oculta todo bajo <body> y vuelve a mostrar solo #invoice-receipt-ticket y
 * sus hijos, sin importar que estén anidados dentro del portal del Dialog.
 */
export function InvoiceReceiptModal({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail | null;
}) {
  const t = useTranslations("Sales");
  const { account } = useAuth();

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #invoice-receipt-ticket, #invoice-receipt-ticket * { visibility: visible; }
            #invoice-receipt-ticket {
              position: fixed;
              inset: 0;
              width: 80mm;
              margin: 0 auto;
              padding: 4mm;
            }
            .invoice-receipt-no-print { display: none !important; }
          }
        `}</style>

        <DialogHeader className="invoice-receipt-no-print shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{t("receipt.title")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-5">
          <div
            id="invoice-receipt-ticket"
            className="mx-auto w-[300px] space-y-3 bg-background p-4 font-mono text-xs text-foreground shadow-sm"
          >
            <div className="space-y-0.5 text-center">
              <p className="text-sm font-bold uppercase">{account?.name ?? t("receipt.defaultBusinessName")}</p>
              <p>{INVOICE_TYPE_LABELS[invoice.type]}</p>
              <p className="font-semibold">{invoiceNumberLabel(invoice)}</p>
              <p>{new Date(invoice.createdAt).toLocaleString("es-PE")}</p>
            </div>

            <div className="border-t border-dashed border-border pt-2">
              <p>
                {t("receipt.customer")}: {invoiceCustomerLabel(invoice)}
              </p>
              {invoice.customerDocType && invoice.customerDocNumber && (
                <p>
                  {invoice.customerDocType}: {invoice.customerDocNumber}
                </p>
              )}
            </div>

            <div className="space-y-1.5 border-t border-dashed border-border pt-2">
              {invoice.items.map((item) => (
                <div key={item.id}>
                  <p className="truncate">{item.description}</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {Number(item.quantity)} x {formatSolesAmount(item.unitPrice)}
                    </span>
                    <span className="text-foreground">{formatSolesAmount(item.totalPrice)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-t border-dashed border-border pt-2">
              <div className="flex justify-between">
                <span>{t("receipt.subtotal")}</span>
                <span>{formatSolesAmount(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("receipt.igv")}</span>
                <span>{formatSolesAmount(invoice.igv)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span>{t("receipt.total")}</span>
                <span>{formatSolesAmount(invoice.total)}</span>
              </div>
            </div>

            <div className="space-y-1 border-t border-dashed border-border pt-2">
              <p className="font-semibold">{t("receipt.payments")}</p>
              {invoice.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between">
                  <span>{PAYMENT_METHOD_LABELS[payment.method]}</span>
                  <span>{formatSolesAmount(payment.amount)}</span>
                </div>
              ))}
            </div>

            <p className="border-t border-dashed border-border pt-2 text-center text-[10px] text-muted-foreground">
              {t("receipt.footer")}
            </p>
          </div>
        </div>

        <div className="invoice-receipt-no-print flex shrink-0 justify-end gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 size-4" />
            {t("receipt.print")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
