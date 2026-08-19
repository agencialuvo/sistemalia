import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { DISPOSABLE_EMAIL_DOMAINS } from './disposable-email-domains';

@ValidatorConstraint({ name: 'isNotDisposableEmail', async: false })
class IsNotDisposableEmailConstraint implements ValidatorConstraintInterface {
  validate(email: unknown): boolean {
    if (typeof email !== 'string') return false;
    const domain = email.split('@')[1]?.toLowerCase().trim();
    if (!domain) return false;
    return !DISPOSABLE_EMAIL_DOMAINS.has(domain);
  }

  defaultMessage(args: ValidationArguments): string {
    const domain = typeof args.value === 'string' ? args.value.split('@')[1] : undefined;
    return `El dominio de correo "${domain ?? ''}" no está permitido (correos temporales/desechables).`;
  }
}

export function IsNotDisposableEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotDisposableEmailConstraint,
    });
  };
}
