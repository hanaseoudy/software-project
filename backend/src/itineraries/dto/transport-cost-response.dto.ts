import { ApiProperty } from '@nestjs/swagger';
import {
  IntercityTransportMode,
  TransportCostDocument,
} from '../schemas/transport-cost.schema';

export class TransportCostResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() dayId!: string;
  @ApiProperty({ enum: IntercityTransportMode }) mode!: IntercityTransportMode;
  @ApiProperty({ example: 'cairo' }) fromCityId!: string;
  @ApiProperty({ example: 'new_york' }) toCityId!: string;
  @ApiProperty({ minimum: 0 }) amount!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;

  static from(entry: TransportCostDocument): TransportCostResponseDto {
    return {
      id: entry._id.toString(),
      dayId: entry.dayId.toString(),
      mode: entry.mode,
      fromCityId: entry.fromCityId,
      toCityId: entry.toCityId,
      amount: entry.amount,
      currency: entry.currency,
    };
  }
}
