import { BadRequestException, ValidationError } from '@nestjs/common';

// collects messages per field, including nested fields like "days.0.city"
function collect(
  errors: ValidationError[],
  parent = '',
  out: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) out[field] = Object.values(e.constraints);
    if (e.children?.length) collect(e.children, field, out);
  }
  return out;
}

// GEN-02: field-level validation messages (same shape as before)
export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException({
    message: 'Validation failed',
    errors: collect(errors),
  });
}
