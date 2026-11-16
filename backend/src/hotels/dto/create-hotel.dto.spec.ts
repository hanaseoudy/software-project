import { ValidationPipe } from '@nestjs/common';
import { CreateHotelDto } from './create-hotel.dto';
import { UpdateHotelDto } from './update-hotel.dto';
import { validationExceptionFactory } from '../../common/validation/validation-exception.factory';

describe('Hotel image request validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, exceptionFactory: validationExceptionFactory });
  const valid = { name: 'Test Hotel', address: 'Test address', city: '507f1f77bcf86cd799439011', country: '507f1f77bcf86cd799439012', starRating: 4 };
  describe.each([CreateHotelDto, UpdateHotelDto])('%s', (metatype) => {
    it.each([null, 'image.png', [1], Array(6).fill('/image.png')])('rejects invalid images %p with HTTP 400', async (images) => {
      await expect(pipe.transform({ ...valid, images }, { type: 'body', metatype })).rejects.toMatchObject({
        status: 400, response: { errors: { images: expect.any(Array) } },
      });
    });
    it.each([undefined, [], ['/api/uploads/hotel/test.png']])('accepts array shape or omission %p', async (images) => {
      await expect(pipe.transform({ ...valid, images }, { type: 'body', metatype })).resolves.toBeDefined();
    });
  });
});
