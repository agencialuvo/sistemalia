import { CashMovement, CashRegister, Invoice, InvoiceItem, Payment, Prisma } from '@prisma/client';

/**
 * Formats one Decimal for JSON — same reasoning as Service/Inventory's
 * toMoney/toDecimalString: Prisma returns Decimal columns as decimal.js
 * instances, useless straight through JSON.stringify. Serialised as a fixed
 * 2-decimal STRING, never a JS number, so money never gets mangled by float
 * arithmetic once it reaches the client.
 */
function toDecimalString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toNullableDecimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : toDecimalString(value);
}

export type SerializedCashRegister = Omit<
  CashRegister,
  'initialBalance' | 'finalBalance' | 'expectedBalance' | 'difference'
> & {
  initialBalance: string;
  finalBalance: string | null;
  expectedBalance: string | null;
  difference: string | null;
};

export function serializeCashRegister(register: CashRegister): SerializedCashRegister {
  return {
    ...register,
    initialBalance: toDecimalString(register.initialBalance),
    finalBalance: toNullableDecimalString(register.finalBalance),
    expectedBalance: toNullableDecimalString(register.expectedBalance),
    difference: toNullableDecimalString(register.difference),
  };
}

export type SerializedCashMovement = Omit<CashMovement, 'amount'> & { amount: string };

export function serializeCashMovement(movement: CashMovement): SerializedCashMovement {
  return { ...movement, amount: toDecimalString(movement.amount) };
}

export type SerializedInvoiceItem = Omit<InvoiceItem, 'quantity' | 'unitPrice' | 'totalPrice' | 'commissionAmount'> & {
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  commissionAmount: string | null;
};

export function serializeInvoiceItem(item: InvoiceItem): SerializedInvoiceItem {
  return {
    ...item,
    quantity: toDecimalString(item.quantity),
    unitPrice: toDecimalString(item.unitPrice),
    totalPrice: toDecimalString(item.totalPrice),
    commissionAmount: toNullableDecimalString(item.commissionAmount),
  };
}

export type SerializedPayment = Omit<Payment, 'amount'> & { amount: string };

export function serializePayment(payment: Payment): SerializedPayment {
  return { ...payment, amount: toDecimalString(payment.amount) };
}

export type SerializedInvoice = Omit<Invoice, 'subtotal' | 'igv' | 'total'> & {
  subtotal: string;
  igv: string;
  total: string;
};

export function serializeInvoice(invoice: Invoice): SerializedInvoice {
  return {
    ...invoice,
    subtotal: toDecimalString(invoice.subtotal),
    igv: toDecimalString(invoice.igv),
    total: toDecimalString(invoice.total),
  };
}
