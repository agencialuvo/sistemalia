import { BadRequestException } from '@nestjs/common';
import { CommissionType } from '@prisma/client';

/**
 * Shared invariant for every level of the Esquema de Comisiones Jerárquico
 * (StaffMember.defaultCommission*, Service.baseCommission*,
 * StaffService.customCommission*): type and value always travel together —
 * one without the other is a half-configured state the commission engine
 * could not interpret — and a PERCENTAGE above 100 has no business meaning
 * (unlike FIXED_AMOUNT, which can legitimately exceed 100 soles).
 *
 * Used by both StaffMembersService (defaultCommission on StaffMember,
 * customCommission on StaffService) and ServicesService (baseCommission on
 * Service) — kept in one place so the three levels can't quietly drift on
 * what "valid" means.
 */
export function assertCommissionIsValid(
  pair: { type?: CommissionType; value?: number },
  label: string,
): void {
  if (pair.type === undefined && pair.value === undefined) return;
  if (pair.type === undefined || pair.value === undefined) {
    throw new BadRequestException(`${label} requiere tanto el tipo como el valor.`);
  }
  if (pair.type === CommissionType.PERCENTAGE && pair.value > 100) {
    throw new BadRequestException(`${label}: una comisión porcentual no puede superar 100%.`);
  }
}
