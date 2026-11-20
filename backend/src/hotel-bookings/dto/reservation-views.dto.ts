import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundResponseDto } from '../../payments/dto/refund-response.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { PAGE_SIZE, PaginationQueryDto } from '../../common/pagination/pagination';

/** HTL-20: the three groups a guest sees their reservations in. */
export enum ReservationGroup {
  UPCOMING = 'upcoming',
  PAST = 'past',
  CANCELLED = 'cancelled',
}

/** HTL-22: the reservation statuses a moderator can filter by. */
export enum ReservationViewStatus {
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class MyReservationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ReservationGroup,
    default: ReservationGroup.UPCOMING,
    description:
      'upcoming: Confirmed stays that have not ended yet. past: Completed stays. cancelled: Cancelled reservations.',
  })
  @IsOptional()
  @IsEnum(ReservationGroup, {
    message: 'Group must be upcoming, past or cancelled',
  })
  group?: ReservationGroup = ReservationGroup.UPCOMING;
}

export class HotelReservationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ReservationViewStatus,
    description: 'Show only reservations with this status',
  })
  @IsOptional()
  @IsEnum(ReservationViewStatus, {
    message: 'Status must be CONFIRMED, COMPLETED or CANCELLED',
  })
  status?: ReservationViewStatus;
}

export class ReservationRoomDto {
  @ApiProperty({ example: '6aef930b9e8df6e7c5a939d2' })
  roomId!: string;

  @ApiProperty({ example: '101', nullable: true })
  roomNumber!: string | null;

  @ApiProperty({ example: 'Deluxe', nullable: true })
  type!: string | null;

  @ApiProperty({ example: 100, description: 'Price per night when it was booked (USD)' })
  pricePerNight!: number;

  @ApiProperty({ example: 2 })
  adults!: number;

  @ApiProperty({ example: 1 })
  children!: number;
}

export class ReservationHotelDto {
  @ApiProperty({ example: '6aef930b9e8df6e7c5a939d1' })
  id!: string;

  @ApiProperty({ example: 'Nile Palace', nullable: true })
  name!: string | null;

  @ApiProperty({ example: '1 Corniche El Nil Street', nullable: true })
  address!: string | null;
}

/** HTL-20: one reservation in the guest's list. */
export class ReservationSummaryDto {
  @ApiProperty({ example: '6aef955ba30ad0ab222602e9' })
  id!: string;

  @ApiProperty({ example: 'HTL-7K3M9Q', nullable: true })
  bookingReference!: string | null;

  @ApiProperty({ type: ReservationHotelDto })
  hotel!: ReservationHotelDto;

  @ApiProperty({ type: [ReservationRoomDto] })
  rooms!: ReservationRoomDto[];

  @ApiProperty({ example: '2026-12-20' })
  checkIn!: string;

  @ApiProperty({ example: '2026-12-23' })
  checkOut!: string;

  @ApiProperty({ example: 3 })
  nights!: number;

  @ApiProperty({ example: 3, description: 'Adults in all rooms' })
  adults!: number;

  @ApiProperty({ example: 1, description: 'Children in all rooms' })
  children!: number;

  @ApiProperty({ example: 660 })
  totalPrice!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ enum: ReservationViewStatus, example: 'CONFIRMED' })
  status!: string;
}

/** HTL-20: full details of one reservation. */
export class ReservationDetailsDto extends ReservationSummaryDto {
  @ApiProperty({ example: '2026-11-10T09:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({
    example: '2026-11-10T09:31:00.000Z',
    nullable: true,
    description: 'When the guest accepted the hotel policies at booking time',
  })
  policiesAcceptedAt!: string | null;

  @ApiProperty({
    type: RefundResponseDto,
    nullable: true,
    description:
      'The refund of a cancelled reservation (amount, status Pending / Refunded / Failed, applied policy), or null when there is none, for example a cancellation with no refund.',
  })
  refund!: RefundResponseDto | null;
}

export class ReservationCountsDto {
  @ApiProperty({ example: 2 })
  upcoming!: number;

  @ApiProperty({ example: 5 })
  past!: number;

  @ApiProperty({ example: 1 })
  cancelled!: number;
}

/** GEN-05: one page (10 reservations) of one group, with the size of every group. */
export class MyReservationsPageDto {
  @ApiProperty({ type: [ReservationSummaryDto] })
  items!: ReservationSummaryDto[];

  @ApiProperty({ example: 2, description: 'Reservations in the chosen group' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  @ApiProperty({ enum: ReservationGroup })
  group!: ReservationGroup;

  @ApiProperty({ type: ReservationCountsDto })
  counts!: ReservationCountsDto;
}

export class ReservationGuestDto {
  @ApiProperty({ example: '6aef0000000000000000aaaa' })
  id!: string;

  @ApiProperty({ example: 'Mariam Mashoud', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 'guest@example.com', nullable: true })
  email!: string | null;
}

/** HTL-22: one reservation in the moderator's list. */
export class HotelReservationDto {
  @ApiProperty({ example: '6aef955ba30ad0ab222602e9' })
  id!: string;

  @ApiProperty({ example: 'HTL-7K3M9Q', nullable: true })
  bookingReference!: string | null;

  @ApiProperty({ type: ReservationGuestDto })
  guest!: ReservationGuestDto;

  @ApiProperty({ example: '2026-12-20' })
  checkIn!: string;

  @ApiProperty({ example: '2026-12-23' })
  checkOut!: string;

  @ApiProperty({ example: 2, description: 'Number of rooms in the reservation' })
  roomCount!: number;

  @ApiProperty({ example: 660 })
  totalPrice!: number;

  @ApiProperty({ enum: ReservationViewStatus, example: 'CONFIRMED' })
  status!: string;
}

export class HotelReservationsPageDto {
  @ApiProperty({ type: [HotelReservationDto] })
  items!: HotelReservationDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
