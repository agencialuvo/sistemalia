import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Sibling field that decides how `depositAmount` is read. */
interface DepositCarrier {
  depositIsPercentage?: boolean;
}

@ValidatorConstraint({ name: 'isDepositAmount', async: false })
class IsDepositAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    // Type and presence are @IsNumber's job — reporting them here too would
    // show the user two errors for one mistake.
    if (typeof value !== 'number') {
      return true;
    }
    const { depositIsPercentage } = args.object as DepositCarrier;
    return depositIsPercentage === true ? value > 0 && value <= 100 : value > 0;
  }

  defaultMessage(args: ValidationArguments): string {
    const { depositIsPercentage } = args.object as DepositCarrier;
    return depositIsPercentage === true
      ? 'El anticipo en porcentaje debe estar entre 1 y 100.'
      : 'El monto del anticipo debe ser mayor a 0.';
  }
}

/**
 * Range-checks `depositAmount` against its sibling `depositIsPercentage`.
 *
 * Exists because the ceiling depends on another field: 100 when the deposit is
 * a percentage, the general price cap when it is an amount in soles. Stacking
 * two @ValidateIf decorators on the property does NOT work — class-validator
 * ANDs every condition registered for a property, so two mutually exclusive
 * conditions cancel out and the field ends up never validated at all.
 */
export function IsDepositAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDepositAmountConstraint,
    });
  };
}
