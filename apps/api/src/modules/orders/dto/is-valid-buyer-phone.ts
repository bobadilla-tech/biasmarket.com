import { ValidateBy, type ValidationOptions } from 'class-validator';
import { validatePhone } from '@biasmarket/utils/phone-country';

// Same rule and Spanish message as GET /stores/:id/customers/lookup, so the
// form shows one error regardless of which endpoint rejects the number.
export function IsValidBuyerPhone(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidBuyerPhone',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && validatePhone(value).ok,
        defaultMessage: (args) => {
          const result =
            typeof args?.value === 'string' ? validatePhone(args.value) : null;
          return result && !result.ok
            ? result.message
            : 'Ingresa un teléfono válido';
        },
      },
    },
    options,
  );
}
