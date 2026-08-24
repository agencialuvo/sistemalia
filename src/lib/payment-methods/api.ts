import { api } from "@/lib/api";
import type { PaymentMethodConfig, PaymentMethodFormInput } from "@/lib/validators/payment-methods";

/** Thin typed wrapper over /payment-methods (menú "Métodos de pago"). */

export async function listPaymentMethods(): Promise<PaymentMethodConfig[]> {
  const { data } = await api.get<PaymentMethodConfig[]>("/payment-methods");
  return data;
}

export async function createPaymentMethod(
  payload: PaymentMethodFormInput,
): Promise<PaymentMethodConfig> {
  const { data } = await api.post<PaymentMethodConfig>("/payment-methods", payload);
  return data;
}

export async function updatePaymentMethod(
  id: string,
  payload: Partial<PaymentMethodFormInput>,
): Promise<PaymentMethodConfig> {
  const { data } = await api.patch<PaymentMethodConfig>(`/payment-methods/${id}`, payload);
  return data;
}

export async function deletePaymentMethod(id: string): Promise<{ id: string; deleted: true }> {
  const { data } = await api.delete<{ id: string; deleted: true }>(`/payment-methods/${id}`);
  return data;
}
