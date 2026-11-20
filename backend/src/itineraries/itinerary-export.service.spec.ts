import 'reflect-metadata';
import { Types } from 'mongoose';
import { byTime, ItineraryExportService } from './itinerary-export.service';

// The @nestjs/* packages are ES modules that jest cannot load here, and the
// service only needs them for decorators and exceptions, so they are stubbed.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  NotFoundException: class NotFoundException extends Error {},
}));
jest.mock('@nestjs/mongoose', () => ({ InjectModel: () => () => undefined }));
jest.mock('../reference-data/schemas/city.schema', () => ({
  City: { name: 'City' },
}));
jest.mock('./schemas/activity.schema', () => ({
  Activity: { name: 'Activity' },
}));
jest.mock('./schemas/itinerary-day.schema', () => ({
  ItineraryDay: { name: 'ItineraryDay' },
}));
jest.mock('./schemas/itinerary.schema', () => ({
  Itinerary: { name: 'Itinerary' },
}));
const mockBuild = jest.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
jest.mock('./utils/itinerary-pdf', () => ({
  ...jest.requireActual('./utils/itinerary-pdf'),
  buildItineraryPdf: (...args: unknown[]) => mockBuild(...args),
}));

const userId = new Types.ObjectId();
const itineraryId = new Types.ObjectId();
const day1 = new Types.ObjectId();
const day2 = new Types.ObjectId();

function chain<T>(result: T) {
  const q: Record<string, jest.Mock> = {};
  q.sort = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(result);
  return q;
}

function setup(
  opts: {
    itinerary?: unknown;
    days?: unknown[];
    cities?: unknown[];
    activities?: unknown[];
  } = {},
) {
  const itinerary =
    opts.itinerary === undefined
      ? {
          _id: itineraryId,
          userId,
          title: 'Egypt in Winter',
          countryIds: ['EG'],
          startDate: new Date('2027-02-27T00:00:00Z'),
        }
      : opts.itinerary;
  const itineraryModel = { findOne: jest.fn(() => chain(itinerary)) };
  const dayModel = {
    find: jest.fn(() =>
      chain(
        opts.days ?? [
          {
            _id: day1,
            itineraryId,
            dayNumber: 1,
            cityId: 'CAI',
            notes: 'Early start',
          },
          { _id: day2, itineraryId, dayNumber: 2, cityId: 'LXR' },
        ],
      ),
    ),
  };
  const activityModel = { find: jest.fn(() => chain(opts.activities ?? [])) };
  const cityModel = {
    find: jest.fn(() =>
      chain(opts.cities ?? [{ cityId: 'CAI', name: 'Cairo' }]),
    ),
  };
  const service = new ItineraryExportService(
    itineraryModel as never,
    dayModel as never,
    activityModel as never,
    cityModel as never,
  );
  return { service, itineraryModel, dayModel, activityModel, cityModel };
}

beforeEach(() => mockBuild.mockClear());

describe('ItineraryExportService.exportPdf', () => {
  it('only reads the itinerary of the logged-in user', async () => {
    const t = setup();
    await t.service.exportPdf(userId.toString(), itineraryId.toString());
    expect(t.itineraryModel.findOne).toHaveBeenCalledWith({
      _id: itineraryId,
      userId,
    });
  });

  it('gives the same answer for a missing itinerary and someone else’s itinerary', async () => {
    const t = setup({ itinerary: null });
    await expect(
      t.service.exportPdf(userId.toString(), itineraryId.toString()),
    ).rejects.toThrow('Itinerary not found');
    expect(t.dayModel.find).not.toHaveBeenCalled();
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('rejects an invalid id without touching the database', async () => {
    const t = setup();
    await expect(
      t.service.exportPdf(userId.toString(), 'nope'),
    ).rejects.toThrow('Itinerary not found');
    expect(t.itineraryModel.findOne).not.toHaveBeenCalled();
  });

  it('builds the PDF from days with dates, city names and activities in time order', async () => {
    const t = setup({
      activities: [
        {
          dayId: day1,
          name: 'Dinner',
          time: '19:00',
          cost: 30,
          currency: 'USD',
        },
        { dayId: day1, name: 'Free time' },
        { dayId: day1, name: 'Pyramids', description: 'Giza', time: '09:00' },
        { dayId: day2, name: 'Temple', time: '10:00' },
      ],
    });
    const result = await t.service.exportPdf(
      userId.toString(),
      itineraryId.toString(),
    );

    const data = mockBuild.mock.calls[0][0];
    expect(data).toMatchObject({
      title: 'Egypt in Winter',
      countryIds: ['EG'],
      startDate: '2027-02-27',
    });
    // Day 2 is the next calendar day, across the month end.
    expect(data.days.map((d: { date: string }) => d.date)).toEqual([
      '2027-02-27',
      '2027-02-28',
    ]);
    expect(data.days[0]).toMatchObject({
      dayNumber: 1,
      cityName: 'Cairo',
      notes: 'Early start',
    });
    expect(
      data.days[0].activities.map((a: { name: string }) => a.name),
    ).toEqual(['Pyramids', 'Dinner', 'Free time']);
    // A city that is not in the list falls back to its code.
    expect(data.days[1].cityName).toBe('LXR');
    expect(result.filename).toBe('itinerary-egypt-in-winter.pdf');
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('only reads the activities of this itinerary’s days', async () => {
    const t = setup();
    await t.service.exportPdf(userId.toString(), itineraryId.toString());
    expect(t.activityModel.find).toHaveBeenCalledWith({
      dayId: { $in: [day1, day2] },
    });
  });

  it('works for an itinerary without days and skips the city and activity queries', async () => {
    const t = setup({ days: [] });
    await t.service.exportPdf(userId.toString(), itineraryId.toString());
    expect(mockBuild.mock.calls[0][0].days).toEqual([]);
    expect(t.cityModel.find).not.toHaveBeenCalled();
    expect(t.activityModel.find).not.toHaveBeenCalled();
  });
});

describe('byTime', () => {
  it('puts timed activities first, in time order, and keeps untimed ones in place', () => {
    const list = [
      { name: 'b' },
      { name: 'c', time: '12:00' },
      { name: 'a', time: '08:00' },
    ];
    expect(list.sort(byTime).map((a) => a.name)).toEqual(['a', 'c', 'b']);
  });
});
