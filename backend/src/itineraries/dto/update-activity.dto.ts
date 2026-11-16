import { PartialType } from '@nestjs/swagger';
import { CreateActivityDto } from './create-activity.dto';

// Omission is allowed; null still fails required name/description/currency validators.
// Explicit null is accepted only by time/cost's existing ValidateIf rules.
export class UpdateActivityDto extends PartialType(CreateActivityDto, {
  skipNullProperties: false,
}) {}
