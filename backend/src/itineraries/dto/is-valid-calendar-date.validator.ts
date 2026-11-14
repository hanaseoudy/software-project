
import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsValidCalendarDate(
  validationOptions?: ValidationOptions,
) {
  return function (
    object: object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'isValidCalendarDate',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'startDate must be a valid calendar date in YYYY-MM-DD format',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }

          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
          }

          const date = new Date(
            `${value}T00:00:00.000Z`,
          );

          return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value
          );
        },
      },
    });
  };
}
