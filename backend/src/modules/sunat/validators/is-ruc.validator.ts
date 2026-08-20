import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidRuc } from './ruc.util';

@ValidatorConstraint({ name: 'isRuc', async: false })
class IsRucConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidRuc(value);
  }

  defaultMessage(): string {
    return 'El número de RUC debe tener 11 dígitos y un dígito verificador válido.';
  }
}

/** Validates an 11-digit Peruvian RUC including its Módulo 11 check digit. */
export function IsRuc(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRucConstraint,
    });
  };
}
