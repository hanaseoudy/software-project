import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { HotelsModule } from '../src/hotels/hotels.module';
import { HotelsService } from '../src/hotels/hotels.service';
import { ProviderType } from '../src/users/schemas/moderatorassignment.schema';
import { UserRole } from '../src/users/schemas/user.schema';

// setup-e2e.ts requires a localhost-only URI and creates a unique disposable DB.
describe('BE-4 GET /api/hotels/:id/rooms room order against isolated local MongoDB', () => {
  let app: INestApplication;
  let db: Connection;
  let hotels: HotelsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(process.env.MONGODB_URI!),
        HotelsModule,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get<Connection>(getConnectionToken());
    expect(db.name).toBe(process.env.E2E_DATABASE_NAME);
    for (const model of Object.values(db.models)) await model.init();
    hotels = app.get(HotelsService);
  });

  afterAll(async () => {
    try {
      if (
        db &&
        db.name === process.env.E2E_DATABASE_NAME &&
        /^travel_e2e_[a-f0-9]{32}$/.test(db.name)
      )
        await db.dropDatabase();
    } finally {
      if (app) await app.close();
      const directory = process.env.UPLOADS_DIR;
      if (
        directory &&
        path.dirname(directory) === tmpdir() &&
        path.basename(directory).startsWith('travel-uploads-e2e-')
      )
        await rm(directory, { recursive: true, force: true });
    }
  });

  it('BE-4: sorts room numbers numerically (1, 2, 10, 11), not as text (1, 10, 11, 2)', async () => {
    const hotel = await db.model('Hotel').create({
      name: 'BE-4 Hotel',
      address: '1 Corniche',
      city: new Types.ObjectId(),
      country: new Types.ObjectId(),
      starRating: 4,
    });
    const moderatorId = new Types.ObjectId();
    await db.model('ModeratorAssignment').create({
      moderatorId,
      providerType: ProviderType.HOTEL,
      providerId: hotel._id,
    });
    const room = (roomNumber: string) => ({
      hotel: hotel._id,
      roomNumber,
      type: 'Double',
      beds: 2,
      maxOccupancy: 2,
      pricePerNight: 100,
    });
    await db
      .model('Room')
      .create([room('10'), room('2'), room('11'), room('1'), room('A10'), room('A2')]);

    const page = await hotels.listRooms(hotel._id.toString(), 1, {
      sub: moderatorId.toString(),
      sid: 's1',
      role: UserRole.MODERATOR,
    } as never);

    expect(page.items.map((item) => item.roomNumber)).toEqual([
      '1',
      '2',
      '10',
      '11',
      'A2',
      'A10',
    ]);
    expect(page).toMatchObject({ total: 6, page: 1, pageSize: 10, totalPages: 1 });
  });
});
