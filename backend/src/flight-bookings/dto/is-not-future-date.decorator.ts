import { registerDecorator, ValidationOptions } from 'class-validator';

/** Passes only for a valid date that is not in the future. */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const time = new Date(value).getTime();
          return !Number.isNaN(time) && time <= Date.now();
        },
        defaultMessage() {
          return 'dateOfBirth cannot be in the future';
        },
      },
    });
  };
}
