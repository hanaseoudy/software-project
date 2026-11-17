import { PartialType } from '@nestjs/swagger';
import { CreateTransportCostDto } from './create-transport-cost.dto';

// Every field remains non-nullable. dayId may move only within the itinerary.
export class UpdateTransportCostDto extends PartialType(
  CreateTransportCostDto,
  { skipNullProperties: false },
) {}
