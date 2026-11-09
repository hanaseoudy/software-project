import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateHotelDto } from './update-hotel.dto';

const failing = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateHotelDto, body))).map(
    (e) => e.property,
  );

describe('UpdateHotelDto', () => {
  it('accepts a single field', async () => {
    expect(await failing({ name: 'Nile Palace' })).toEqual([]);
  });

  it('accepts an empty body (the service asks for at least one field)', async () => {
    expect(await failing({})).toEqual([]);
  });

  it.each([
    'name',
    'description',
    'address',
    'city',
    'country',
    'starRating',
    'amenities',
    'images',
  ])('rejects null for %s with a 400-style validation error', async (field) => {
    expect(await failing({ [field]: null })).toEqual([field]);
  });

  it('still validates values that are sent', async () => {
    expect(await failing({ starRating: 9 })).toEqual(['starRating']);
    expect(await failing({ name: 'A' })).toEqual(['name']);
    expect(await failing({ city: 'nope' })).toEqual(['city']);
  });

  it('allows up to 5 images and rejects 6', async () => {
    const link = '/api/uploads/hotel/0b8e6f1c-3b52-4c8e-9a41-5f6a9c1d2e33.jpg';
    expect(await failing({ images: Array(5).fill(link) })).toEqual([]);
    expect(await failing({ images: Array(6).fill(link) })).toEqual(['images']);
  });
});
