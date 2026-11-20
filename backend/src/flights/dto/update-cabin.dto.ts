import { PartialType, PickType } from '@nestjs/swagger';
import { AddCabinDto } from './add-cabin.dto';

export class UpdateCabinDto extends PartialType(
  PickType(AddCabinDto, ['totalSeats', 'price'] as const),
) {}
