import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceDto } from './create-service.dto';

/**
 * PATCH /services/:id.
 *
 * Every field becomes optional, which also means the conditional rules in the
 * parent stop firing on a partial body — `@ValidateIf(o => o.structureType ===
 * SESSIONS)` cannot see a structureType that was not sent. The invariants are
 * therefore re-checked in ServicesService.update() against the MERGED entity
 * (stored row + patch), which is the only place where the complete picture
 * exists. Without that, `PATCH { structureType: "SESSIONS" }` alone would
 * produce a package with no session count.
 */
export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
