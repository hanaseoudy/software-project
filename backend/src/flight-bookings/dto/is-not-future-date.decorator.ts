import { registerDecorator, ValidationOptions } from 'class-validator';
import { isPastCalendarDate } from '../utils/birth-date';

/** Passes only for a real calendar date (YYYY-MM-DD, so 2000-02-30 fails) that is not in the future. */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isPastCalendarDate(value);
        },
        defaultMessage() {
          return 'dateOfBirth must be a real date in YYYY-MM-DD format and not in the future';
        },
      },
    });
  };
}
