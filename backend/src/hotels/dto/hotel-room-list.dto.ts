import { ApiProperty } from '@nestjs/swagger';
import { RoomAvailabilityResponseDto } from './room-availability-response.dto';
import { RoomResponseDto } from './room-response.dto';

/**
 * BE-4 (HTL-03, HTL-05, HTL-06): one room of the moderator's hotel, with the date
 * ranges the edit page needs (their ids are used by the PATCH / DELETE range routes).
 */
export class HotelRoomListItemDto extends RoomResponseDto {
  @ApiProperty({
    type: [RoomAvailabilityResponseDto],
    description:
      'Bookable date ranges of the room (HTL-04), oldest start date first. Both days are included.',
  })
  availabilityRanges!: RoomAvailabilityResponseDto[];

  @ApiProperty({
    type: [RoomAvailabilityResponseDto],
    description:
      'Blocked date ranges of the room (HTL-05), oldest start date first. Both days are included.',
  })
  blocks!: RoomAvailabilityResponseDto[];
}

/** GEN-05: one page (10 rooms) of the hotel's rooms. */
export class HotelRoomListPageDto {
  @ApiProperty({ type: [HotelRoomListItemDto], description: 'Up to 10 rooms' })
  items!: HotelRoomListItemDto[];

  @ApiProperty({ example: 12, description: 'Total number of rooms' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
