import { Prisma, StaffMember, StaffService } from '@prisma/client';

/**
 * StaffMember as it goes over the wire: every Decimal money/commission field
 * as a fixed 2-decimal string — same reasoning as service.serializer.ts's
 * toMoney: a Prisma Decimal serialises to JSON as `{"s":1,"e":1,"d":[15]}`,
 * not a usable number.
 *
 * `defaultCommissionValue` is nivel 3 (el más general) del Esquema de
 * Comisiones Jerárquico — StaffMember's own field. `services[].
 * customCommissionValue` (nivel 1, el más específico) is a Decimal too and
 * gets the same treatment when the caller's include brought that relation
 * along (only DETAIL_INCLUDE does — LIST_INCLUDE has no `services`, hence
 * the optional field below). Nivel 2 (Service.baseCommissionValue) is
 * serialised separately, in service.serializer.ts.
 */
export type SerializedStaffMember<T> = Omit<T, 'commissionPercentage' | 'defaultCommissionValue'> & {
  commissionPercentage: string | null;
  defaultCommissionValue: string | null;
};

function toDecimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function serializeStaffServiceCommission<
  T extends Pick<StaffService, 'customCommissionValue'> & {
    service?: { baseCommissionValue?: Prisma.Decimal | null };
  },
>(entry: T): Omit<T, 'customCommissionValue'> & { customCommissionValue: string | null } {
  return {
    ...entry,
    customCommissionValue: toDecimalString(entry.customCommissionValue),
    // Nivel 2 (base) viaja anidado en `service` — serializado aquí también,
    // ya que esta respuesta no pasa por service.serializer.ts.
    ...(entry.service && 'baseCommissionValue' in entry.service
      ? { service: { ...entry.service, baseCommissionValue: toDecimalString(entry.service.baseCommissionValue ?? null) } }
      : {}),
  } as Omit<T, 'customCommissionValue'> & { customCommissionValue: string | null };
}

export function serializeStaffMember<
  T extends Pick<StaffMember, 'commissionPercentage' | 'defaultCommissionValue'> & {
    services?: Array<Pick<StaffService, 'customCommissionValue'>>;
  },
>(staff: T): SerializedStaffMember<T> {
  return {
    ...staff,
    commissionPercentage: toDecimalString(staff.commissionPercentage),
    defaultCommissionValue: toDecimalString(staff.defaultCommissionValue),
    ...(staff.services ? { services: staff.services.map(serializeStaffServiceCommission) } : {}),
  } as SerializedStaffMember<T>;
}

export function serializeStaffMembers<
  T extends Pick<StaffMember, 'commissionPercentage' | 'defaultCommissionValue'> & {
    services?: Array<Pick<StaffService, 'customCommissionValue'>>;
  },
>(staff: T[]): Array<SerializedStaffMember<T>> {
  return staff.map(serializeStaffMember);
}
