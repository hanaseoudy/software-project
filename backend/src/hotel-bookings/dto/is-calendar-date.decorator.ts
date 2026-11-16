import { registerDecorator, ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../utils/calendar-date';

/** Accepts only a real calendar date written as YYYY-MM-DD (no time, no zone). */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a real date in YYYY-MM-DD format (no time or time zone)`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
      },
    });
  };
}
