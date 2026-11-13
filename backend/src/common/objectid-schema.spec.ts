import { Mongoose, Types } from 'mongoose';
import { PostSchema } from '../blog/schemas/post.schema';
import { HotelBookingSchema } from '../hotel-bookings/schemas/hotel-booking.schema';
import { PaymentSchema } from '../payments/schemas/payment.schema';
import { ModeratorAssignmentSchema } from '../users/schemas/moderatorassignment.schema';

// Exercise the actual schemas without connecting to a database.
describe('ObjectId reference casting', () => {
  const mongoose = new Mongoose();
  const id = '507f1f77bcf86cd799439011';
  const cases = [
    { name: 'Post', schema: PostSchema, field: 'author' },
    { name: 'HotelBooking', schema: HotelBookingSchema, field: 'user' },
    { name: 'BookedRoom', schema: HotelBookingSchema, field: 'rooms.room' },
    { name: 'Payment', schema: PaymentSchema, field: 'bookingId' },
    {
      name: 'ModeratorAssignment',
      schema: ModeratorAssignmentSchema,
      field: 'moderatorId',
    },
  ];

  describe.each(cases)('$name.$field', ({ name, schema, field }) => {
    const model = mongoose.model(name, schema);

    it('casts a string query ID to ObjectId', () => {
      const query = model.findOne({ [field]: id });
      const filter = query.cast(model);

      expect(filter[field]).toBeInstanceOf(Types.ObjectId);
      expect(String(filter[field])).toBe(id);
    });

    it('preserves an existing ObjectId query value', () => {
      const query = model.findOne({ [field]: new Types.ObjectId(id) });
      const filter = query.cast(model);

      expect(filter[field]).toBeInstanceOf(Types.ObjectId);
      expect(String(filter[field])).toBe(id);
    });

    it('rejects malformed reference IDs', () => {
      const query = model.findOne({ [field]: 'not-an-object-id' });

      expect(() => query.cast(model)).toThrow(mongoose.Error.CastError);
    });
  });
});
