"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Lock, Package, Plus, Search, Trash2, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceReceiptModal } from "@/components/sales/invoice-receipt-modal";
import { getApiErrorMessage } from "@/lib/api";
import { getAppointment, listAppointments } from "@/lib/appointments/api";
import { getPatientProfile, listPatients } from "@/lib/patients/api";
import { createInvoice, getCurrentCashRegister, listInvoices } from "@/lib/sales/api";
import { listProducts } from "@/lib/inventory/api";
import { listServices } from "@/lib/services/api";
import { listStaff } from "@/lib/staff/api";
import type { Appointment } from "@/lib/validators/appointment";
import { todayDateOnly } from "@/lib/validators/appointment";
import type { Product } from "@/lib/validators/inventory";
import type { Patient } from "@/lib/validators/patient";
import type { Service } from "@/lib/validators/service";
import {
  CUSTOMER_DOC_TYPES,
  formatSolesAmount,
  INVOICE_TYPE_LABELS,
  INVOICE_TYPES,
  invoiceNumberLabel,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type CustomerDocType,
  type InvoiceDetail,
  type InvoiceType,
  type PaymentMethod,
} from "@/lib/validators/sales";
import type { StaffMember } from "@/lib/validators/staff";

const SEARCH_DEBOUNCE_MS = 300;

interface CartItem {
  key: string;
  serviceId?: string;
  productId?: string;
  batchId?: string;
  staffId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  unitLabel?: string;
}

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
  referenceNumber: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

const APPOINTMENT_BILLABLE_STATUSES = new Set(["CONFIRMED", "IN_SERVICE", "COMPLETED"]);

/**
 * Pestaña "Punto de Venta / Cobro Rápido" (Módulo 08 Fase 2, Task 2.4,
 * plan.md Pestaña 1). Arma un carrito de servicios/productos, opcionalmente
 * ligado a una cita del día, y lo cobra en una sola llamada a POST
 * /sales/invoices — el backend recalcula totales, IGV, correlativo y
 * comisión, este componente solo junta lo que el usuario eligió.
 */
export function PosTab({
  refreshKey,
  onCompleted,
  initialAppointmentId,
}: {
  refreshKey: number;
  onCompleted: () => void;
  /** Llegada desde el botón "Cobrar / Ver en Caja" del popover de citas de
   *  la Agenda (?appointmentId=...) — precarga el paciente y arma el
   *  carrito con esa cita, reusando exactamente el mismo camino que elegir
   *  la cita a mano en "Citas pendientes de cobro" (misma llamada a
   *  addAppointmentToCart, así que también queda ligada a appointmentId
   *  para la factura y respeta el chequeo de "ya cobrada"). */
  initialAppointmentId?: string;
}) {
  const t = useTranslations("Sales");

  const [registerOpen, setRegisterOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCurrentCashRegister()
      .then((register) => {
        if (!cancelled) setRegisterOpen(register !== null);
      })
      .catch(() => {
        if (!cancelled) setRegisterOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // --- Paciente -------------------------------------------------------------

  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);

  useEffect(() => {
    if (patient) return;
    const timer = setTimeout(() => {
      setPatientLoading(true);
      void listPatients({ search: patientSearch.trim() || undefined, status: "ACTIVE", pageSize: 12 })
        .then((result) => setPatientResults(result.data))
        .catch(() => setPatientResults([]))
        .finally(() => setPatientLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [patient, patientSearch]);

  // --- Citas pendientes de cobro ---------------------------------------------

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  function loadAppointments(forPatient: Patient) {
    setAppointmentsLoading(true);
    const today = todayDateOnly();
    Promise.all([
      listAppointments({ dateFrom: today, dateTo: today, patientId: forPatient.id }),
      listInvoices({ patientId: forPatient.id, status: "PAID", pageSize: 48 }),
    ])
      .then(([appointmentsResult, invoicesResult]) => {
        // Una cita con un comprobante PAID activo ya se cobró — aunque su
        // status haya quedado en COMPLETED, no debe reofrecerse (tasks.md
        // Fase 3, Task 3.3).
        const invoicedAppointmentIds = new Set(
          invoicesResult.data.map((invoice) => invoice.appointmentId).filter((id): id is string => Boolean(id)),
        );
        setAppointments(
          appointmentsResult.data.filter(
            (appointment) =>
              APPOINTMENT_BILLABLE_STATUSES.has(appointment.status) && !invoicedAppointmentIds.has(appointment.id),
          ),
        );
      })
      .catch(() => setAppointments([]))
      .finally(() => {
        setAppointmentsLoading(false);
        setAppointmentsLoaded(true);
      });
  }

  function selectPatient(next: Patient) {
    setPatient(next);
    setAppointments([]);
    setAppointmentsLoaded(false);
    setAppointmentId(null);
    loadAppointments(next);
  }

  function clearPatient() {
    setPatient(null);
    setPatientSearch("");
    setAppointments([]);
    setAppointmentsLoaded(false);
    setAppointmentId(null);
  }

  // --- Servicios / Productos --------------------------------------------------

  const [services, setServices] = useState<Service[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffMember[]>([]);

  useEffect(() => {
    void listServices({ isActive: true, pageSize: 48 }).then((result) => setServices(result.data));
    void listStaff({ isActive: true, pageSize: 48 }).then((result) => setStaffOptions(result.data));
  }, []);

  const [serviceSearch, setServiceSearch] = useState("");
  const filteredServices = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    if (!query) return services.slice(0, 8);
    return services.filter((service) => service.name.toLowerCase().includes(query)).slice(0, 8);
  }, [services, serviceSearch]);

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setProductLoading(true);
      void listProducts({ search: productSearch.trim() || undefined, isActive: true, pageSize: 12 })
        .then((result) => setProductResults(result.data))
        .catch(() => setProductResults([]))
        .finally(() => setProductLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // --- Carrito ---------------------------------------------------------------

  const [cart, setCart] = useState<CartItem[]>([]);

  function addAppointmentToCart(appointment: Appointment) {
    setAppointmentId(appointment.id);
    setCart((items) => [
      ...items,
      {
        key: newKey(),
        serviceId: appointment.service.id,
        staffId: appointment.staffMember.id,
        description: appointment.service.name,
        quantity: "1",
        unitPrice: "0.00",
        unitLabel: undefined,
      },
    ]);
  }

  useEffect(() => {
    if (!initialAppointmentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const appointment = await getAppointment(initialAppointmentId);
        const fullPatient = await getPatientProfile(appointment.patientId);
        if (cancelled) return;
        selectPatient(fullPatient);
        addAppointmentToCart(appointment);
      } catch {
        // Silencioso — el usuario simplemente arma el carrito a mano si la
        // cita no se pudo precargar (ej. ya fue cobrada y borrada del deep
        // link, o el id es inválido).
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo debe correr una vez al montar con el deep link — selectPatient/
    // addAppointmentToCart no son estables entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAppointmentId]);

  function addServiceToCart(service: Service) {
    setCart((items) => [
      ...items,
      {
        key: newKey(),
        serviceId: service.id,
        description: service.name,
        quantity: "1",
        unitPrice: service.singlePrice,
      },
    ]);
    setServiceSearch("");
  }

  function addProductToCart(product: Product) {
    setCart((items) => [
      ...items,
      {
        key: newKey(),
        productId: product.id,
        description: product.name,
        quantity: "1",
        unitPrice: product.salePrice ?? product.costPrice,
        unitLabel: product.unitOfMeasure,
      },
    ]);
    setProductSearch("");
    setProductResults([]);
  }

  function updateCartItem(key: string, patch: Partial<CartItem>) {
    setCart((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeCartItem(key: string) {
    setCart((items) => items.filter((item) => item.key !== key));
  }

  const cartTotal = useMemo(
    () =>
      round2(
        cart.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0),
      ),
    [cart],
  );

  // --- Comprobante -------------------------------------------------------------

  const [invoiceType, setInvoiceType] = useState<InvoiceType>("BOLETA");
  const [customerDocType, setCustomerDocType] = useState<CustomerDocType>("DNI");
  const [customerDocNumber, setCustomerDocNumber] = useState("");
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    if (invoiceType === "FACTURA") setCustomerDocType("RUC");
    else if (invoiceType === "BOLETA") setCustomerDocType("DNI");
  }, [invoiceType]);

  // --- Pagos ---------------------------------------------------------------

  const [payments, setPayments] = useState<PaymentRow[]>([
    { key: newKey(), method: "CASH", amount: "", referenceNumber: "" },
  ]);

  const paymentsTotal = useMemo(
    () => round2(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)),
    [payments],
  );
  const paymentsDifference = round2(cartTotal - paymentsTotal);

  function addPaymentRow() {
    setPayments((rows) => [
      ...rows,
      { key: newKey(), method: "CASH", amount: paymentsDifference > 0 ? paymentsDifference.toFixed(2) : "", referenceNumber: "" },
    ]);
  }

  function updatePaymentRow(key: string, patch: Partial<PaymentRow>) {
    setPayments((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removePaymentRow(key: string) {
    setPayments((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));
  }

  // --- Envío -----------------------------------------------------------------

  const [submitting, setSubmitting] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<InvoiceDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const canSubmit =
    cart.length > 0 &&
    Math.abs(paymentsDifference) <= 0.01 &&
    payments.every((payment) => Number(payment.amount) > 0) &&
    (invoiceType !== "FACTURA" || (customerDocNumber.trim() !== "" && customerName.trim() !== ""));

  function resetCart() {
    setPatient(null);
    setPatientSearch("");
    setAppointments([]);
    setAppointmentsLoaded(false);
    setAppointmentId(null);
    setCart([]);
    setInvoiceType("BOLETA");
    setCustomerDocNumber("");
    setCustomerName("");
    setPayments([{ key: newKey(), method: "CASH", amount: "", referenceNumber: "" }]);
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const invoice = await createInvoice({
        type: invoiceType,
        patientId: patient?.id,
        appointmentId: appointmentId ?? undefined,
        customerDocType: customerDocNumber.trim() ? customerDocType : undefined,
        customerDocNumber: customerDocNumber.trim() || undefined,
        customerName: customerName.trim() || undefined,
        items: cart.map((item) => ({
          serviceId: item.serviceId,
          productId: item.productId,
          batchId: item.batchId,
          staffId: item.staffId,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
          referenceNumber: payment.referenceNumber.trim() || undefined,
        })),
      });
      toast.success(t("pos.completed", { number: invoiceNumberLabel(invoice) }));
      resetCart();
      onCompleted();
      setCompletedInvoice(invoice);
      setReceiptOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("pos.saveFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  if (registerOpen === null) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!registerOpen) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <Lock className="size-8 text-muted-foreground/60" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("pos.cashClosedTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pos.cashClosedDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <section>
          <Label>{t("pos.patientLabel")}</Label>
          {patient ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-foreground">
                  {patient.firstName} {patient.lastName}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearPatient}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="mt-1.5 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  placeholder={t("pos.patientSearchPlaceholder")}
                  className="pl-9"
                />
              </div>
              {patientLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : patientSearch.trim() && patientResults.length > 0 ? (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {patientResults.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => selectPatient(candidate)}
                        className="flex w-full items-center justify-between p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                      >
                        <span className="truncate text-foreground">
                          {candidate.firstName} {candidate.lastName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("pos.patientOptionalHint")}</p>
            </div>
          )}
        </section>

        {patient && (
          <section>
            <Label>{t("pos.appointmentsLabel")}</Label>
            <div className="mt-1.5">
              {appointmentsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : appointmentsLoaded && appointments.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("pos.noAppointments")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {appointments.map((appointment) => (
                    <li key={appointment.id}>
                      <button
                        type="button"
                        onClick={() => addAppointmentToCart(appointment)}
                        disabled={appointmentId === appointment.id}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-50"
                      >
                        <span className="truncate text-foreground">{appointment.service.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {appointment.staffMember.firstName} {appointment.staffMember.lastName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section>
          <Label>{t("pos.addServiceLabel")}</Label>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={serviceSearch}
              onChange={(event) => setServiceSearch(event.target.value)}
              placeholder={t("pos.addServicePlaceholder")}
              className="pl-9"
            />
          </div>
          {serviceSearch.trim() && (
            <ul className="mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {filteredServices.map((service) => (
                <li key={service.id}>
                  <button
                    type="button"
                    onClick={() => addServiceToCart(service)}
                    className="flex w-full items-center justify-between p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="truncate text-foreground">{service.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatSolesAmount(service.singlePrice)}
                    </span>
                  </button>
                </li>
              ))}
              {filteredServices.length === 0 && (
                <li className="p-3 text-center text-xs text-muted-foreground">{t("pos.noServices")}</li>
              )}
            </ul>
          )}
        </section>

        <section>
          <Label>{t("pos.addProductLabel")}</Label>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder={t("pos.addProductPlaceholder")}
              className="pl-9"
            />
          </div>
          {productSearch.trim() && (
            <ul className="mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {productLoading ? (
                <li className="flex justify-center p-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </li>
              ) : productResults.length === 0 ? (
                <li className="p-3 text-center text-xs text-muted-foreground">{t("pos.noProducts")}</li>
              ) : (
                productResults.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => addProductToCart(product)}
                      className="flex w-full items-center justify-between p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-foreground">
                        <Package className="size-3.5 shrink-0 text-muted-foreground" />
                        {product.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatSolesAmount(product.salePrice ?? product.costPrice)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        <section>
          <Label>{t("pos.cartLabel")}</Label>
          {cart.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              {t("pos.emptyCart")}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {cart.map((item) => (
                <div key={item.key} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.description}</p>
                    <Button variant="ghost" size="sm" onClick={() => removeCartItem(item.key)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px]">{t("pos.quantity")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) => updateCartItem(item.key, { quantity: event.target.value })}
                        className="mt-1 h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">{t("pos.unitPrice")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) => updateCartItem(item.key, { unitPrice: event.target.value })}
                        className="mt-1 h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">{t("pos.totalPrice")}</Label>
                      <p className="mt-1 flex h-8 items-center text-sm font-semibold text-foreground">
                        {formatSolesAmount(
                          round2((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toFixed(2),
                        )}
                      </p>
                    </div>
                  </div>
                  {item.serviceId && (
                    <div className="mt-2">
                      <Label className="text-[11px]">{t("pos.staffLabel")}</Label>
                      <Select
                        value={item.staffId ?? "__none__"}
                        onValueChange={(value) =>
                          updateCartItem(item.key, { staffId: value === "__none__" ? undefined : (value ?? undefined) })
                        }
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue>
                            {(value: string | null) => {
                              if (!value || value === "__none__") return t("pos.noStaff");
                              const member = staffOptions.find((candidate) => candidate.id === value);
                              return member ? `${member.firstName} ${member.lastName}` : t("pos.noStaff");
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("pos.noStaff")}</SelectItem>
                          {staffOptions.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.firstName} {member.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-5 lg:col-span-2">
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{t("pos.summaryTitle")}</h3>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("pos.total")}</span>
            <span className="text-xl font-semibold text-foreground">{formatSolesAmount(cartTotal.toFixed(2))}</span>
          </div>

          <div className="mt-4">
            <Label>{t("pos.invoiceTypeLabel")}</Label>
            <Select value={invoiceType} onValueChange={(value) => setInvoiceType((value as InvoiceType) ?? invoiceType)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue>{(value: string | null) => INVOICE_TYPE_LABELS[(value as InvoiceType) ?? "BOLETA"]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INVOICE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {INVOICE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {invoiceType !== "SALE_NOTE" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">{t("pos.docTypeLabel")}</Label>
                <Select
                  value={customerDocType}
                  onValueChange={(value) => setCustomerDocType((value as CustomerDocType) ?? customerDocType)}
                  disabled={invoiceType === "FACTURA"}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue>{(value: string | null) => value ?? customerDocType}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_DOC_TYPES.map((docType) => (
                      <SelectItem key={docType} value={docType}>
                        {docType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">{t("pos.docNumberLabel")}</Label>
                <Input
                  value={customerDocNumber}
                  onChange={(event) => setCustomerDocNumber(event.target.value)}
                  className="mt-1 h-8"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[11px]">{t("pos.customerNameLabel")}</Label>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="mt-1 h-8"
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{t("pos.paymentsTitle")}</h3>
            <Button variant="ghost" size="sm" onClick={addPaymentRow}>
              <Plus className="mr-1 size-3.5" />
              {t("pos.addPayment")}
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {payments.map((payment) => (
              <div key={payment.key} className="flex items-center gap-2">
                <Select
                  value={payment.method}
                  onValueChange={(value) => updatePaymentRow(payment.key, { method: (value as PaymentMethod) ?? payment.method })}
                >
                  <SelectTrigger className="h-8 w-32 shrink-0">
                    <SelectValue>{(value: string | null) => PAYMENT_METHOD_LABELS[(value as PaymentMethod) ?? "CASH"]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payment.amount}
                  onChange={(event) => updatePaymentRow(payment.key, { amount: event.target.value })}
                  placeholder="0.00"
                  className="h-8"
                />
                {payment.method !== "CASH" && (
                  <Input
                    value={payment.referenceNumber}
                    onChange={(event) => updatePaymentRow(payment.key, { referenceNumber: event.target.value })}
                    placeholder={t("pos.referencePlaceholder")}
                    className="h-8 w-28 shrink-0"
                  />
                )}
                {payments.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removePaymentRow(payment.key)}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("pos.paymentsSum")}</span>
            <span className={Math.abs(paymentsDifference) > 0.01 ? "font-medium text-destructive" : "font-medium text-emerald-600"}>
              {formatSolesAmount(paymentsTotal.toFixed(2))}
            </span>
          </div>
        </section>

        <Button className="w-full" size="lg" disabled={!canSubmit || submitting} onClick={() => void submit()}>
          {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {t("pos.submit")}
        </Button>
      </div>

      <InvoiceReceiptModal open={receiptOpen} onOpenChange={setReceiptOpen} invoice={completedInvoice} />
    </div>
  );
}
