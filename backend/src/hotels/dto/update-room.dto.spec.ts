import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRoomDto } from './update-room.dto';

const failing = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateRoomDto, body))).map((e) => e.property);

describe('UpdateRoomDto', () => {
  it('accepts any single field', async () => {
    expect(await failing({ beds: 3 })).toEqual([]);
    expect(await failing({ maxOccupancy: 5 })).toEqual([]);
    expect(await failing({ pricePerNight: 99.99 })).toEqual([]);
  });

  it('accepts all three fields together', async () => {
    expect(
      await failing({ beds: 2, maxOccupancy: 4, pricePerNight: 1750 }),
    ).toEqual([]);
  });

  it.each([0, -1, 1.5, '2', 51])('rejects beds = %p', async (beds) => {
    expect(await failing({ beds })).toEqual(['beds']);
  });

  it.each([0, 2.5, 101])('rejects maxOccupancy = %p', async (value) => {
    expect(await failing({ maxOccupancy: value })).toEqual(['maxOccupancy']);
  });

  it.each([0, -5, 10.123, '100'])('rejects pricePerNight = %p', async (v) => {
    expect(await failing({ pricePerNight: v })).toEqual(['pricePerNight']);
  });

  it.each(['beds', 'maxOccupancy', 'pricePerNight'])(
    'rejects null for %s with a validation error',
    async (field) => {
      expect(await failing({ [field]: null })).toEqual([field]);
    },
  );

  it('accepts an empty body (the service rejects it as "send at least one")', async () => {
    expect(await failing({})).toEqual([]);
  });
});
