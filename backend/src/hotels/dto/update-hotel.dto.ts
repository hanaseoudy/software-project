import { PartialType } from '@nestjs/swagger';
import { CreateHotelDto } from './create-hotel.dto';

/** All fields optional; at least one must be provided (checked in the service). */
export class UpdateHotelDto extends PartialType(CreateHotelDto) {}
