import { Prisma, Service, ServiceCategory, ServicePackage } from '@prisma/client';

/** The three Decimal columns living directly on Service. Kept in one place so
 *  a new money field cannot be added to the model and forgotten here.
 *  `ServicePackage.price` is a Decimal too, serialised separately below since
 *  it lives on the nested relation, not on Service itself. */
const MONEY_FIELDS = ['singlePrice', 'evaluationCost', 'depositAmount'] as const;

type MoneyField = (typeof MONEY_FIELDS)[number];

export type SerializedServicePackage = Omit<ServicePackage, 'price'> & { price: string };

/** Service as it goes over the wire: money as fixed 2-decimal strings. */
export type SerializedService = Omit<Service, MoneyField> & {
  singlePrice: string;
  evaluationCost: string | null;
  depositAmount: string | null;
  packages: SerializedServicePackage[];
};

export type SerializedServiceWithCategory = SerializedService & {
  category: Pick<ServiceCategory, 'id' | 'name' | 'color'>;
};

/**
 * Formats one Decimal for JSON.
 *
 * Prisma returns Decimal columns as decimal.js instances, and JSON.stringify
 * turns those into `{"s":1,"e":2,"d":[999,990000]}` — not a number, not a
 * string, and useless to the client. Serialising as a STRING rather than a
 * number is deliberate: JavaScript numbers are binary doubles, so a price that
 * survives the database exactly can come back as 199.89999999999998 once it
 * has been through arithmetic on the client. Money crosses the wire as text
 * and is parsed only where a calculation actually needs it.
 *
 * toFixed(2) also normalises the presentation — "1200.00", never "1200" — so
 * the UI never has to pad it before showing soles.
 */
function toMoney(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function serializePackage(pkg: ServicePackage): SerializedServicePackage {
  return { ...pkg, price: pkg.price.toFixed(2) };
}

export function serializeService<T extends Service & { packages: ServicePackage[] }>(
  service: T,
): Omit<T, MoneyField | 'packages'> & SerializedService {
  return {
    ...service,
    singlePrice: service.singlePrice.toFixed(2),
    evaluationCost: toMoney(service.evaluationCost),
    depositAmount: toMoney(service.depositAmount),
    packages: service.packages.map(serializePackage),
  };
}

export function serializeServices<T extends Service & { packages: ServicePackage[] }>(
  services: T[],
): Array<Omit<T, MoneyField | 'packages'> & SerializedService> {
  return services.map(serializeService);
}
