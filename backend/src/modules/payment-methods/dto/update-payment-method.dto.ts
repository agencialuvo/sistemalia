import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentMethodDto } from './create-payment-method.dto';

/** PATCH /payment-methods/:id — every field optional, merged against the
 *  stored row in PaymentMethodsService before the per-type shape is
 *  re-validated (same "merge, then validate the whole" convention as
 *  UpdateServiceDto). */
export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {}
