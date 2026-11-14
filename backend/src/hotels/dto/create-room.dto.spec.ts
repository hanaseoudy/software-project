import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoomDto } from './create-room.dto';

const valid = {
  roomNumber: 'A101',
  type: 'Double',
  beds: 2,
  maxOccupancy: 3,
  pricePerNight: 1500.5,
};

const failing = async (changes: Record<string, unknown>) =>
  (
    await validate(plainToInstance(CreateRoomDto, { ...valid, ...changes }))
  ).map((e) => e.property);

describe('CreateRoomDto', () => {
  it('accepts a valid room', async () => {
    expect(await failing({})).toEqual([]);
  });

  it('trims the room number and type', async () => {
    const dto = plainToInstance(CreateRoomDto, {
      ...valid,
      roomNumber: '  A101 ',
      type: ' Double ',
    });
    expect(dto.roomNumber).toBe('A101');
    expect(dto.type).toBe('Double');
  });

  it.each(['', '   '])('rejects a blank room number "%s"', async (value) => {
    expect(await failing({ roomNumber: value })).toEqual(['roomNumber']);
  });

  it.each([0, -1, 1.5, '2'])('rejects %p beds', async (value) => {
    expect(await failing({ beds: value })).toEqual(['beds']);
  });

  it.each([0, -3, 2.5])('rejects %p as maximum occupancy', async (value) => {
    expect(await failing({ maxOccupancy: value })).toEqual(['maxOccupancy']);
  });

  it.each([0, -5, 10.123, '100'])('rejects %p as price', async (value) => {
    expect(await failing({ pricePerNight: value })).toEqual(['pricePerNight']);
  });

  it('accepts the smallest price, 0.01', async () => {
    expect(await failing({ pricePerNight: 0.01 })).toEqual([]);
  });

  it('reports every missing field', async () => {
    const errors = await validate(plainToInstance(CreateRoomDto, {}));
    expect(errors.map((e) => e.property).sort()).toEqual([
      'beds',
      'maxOccupancy',
      'pricePerNight',
      'roomNumber',
      'type',
    ]);
  });
});
