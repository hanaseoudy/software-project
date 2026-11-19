import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// HTL-24: the :id path parameter of GET /api/hotels/:id/reviews
export class HotelIdParamDto {
  @ApiProperty({ example: '6aef930b9e8df6e7c5a939d1', description: 'Hotel id' })
  @IsMongoId({ message: 'Hotel id must be a valid id' })
  id!: string;
}
