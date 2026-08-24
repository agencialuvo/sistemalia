import { Prisma, StaffMember } from '@prisma/client';

/** StaffMember as it goes over the wire: commissionPercentage as a fixed
 *  2-decimal string — same reasoning as service.serializer.ts's toMoney: a
 *  Prisma Decimal serialises to JSON as `{"s":1,"e":1,"d":[15]}`, not a
 *  usable number. */
export type SerializedStaffMember<T> = Omit<T, 'commissionPercentage'> & {
  commissionPercentage: string | null;
};

function toPercentage(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(2);
}

export function serializeStaffMember<T extends Pick<StaffMember, 'commissionPercentage'>>(
  staff: T,
): SerializedStaffMember<T> {
  return {
    ...staff,
    commissionPercentage: toPercentage(staff.commissionPercentage),
  };
}

export function serializeStaffMembers<T extends Pick<StaffMember, 'commissionPercentage'>>(
  staff: T[],
): Array<SerializedStaffMember<T>> {
  return staff.map(serializeStaffMember);
}
