import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { ListCitiesQueryDto } from './dto/list-cities-query.dto';
import { ReferenceDataService } from './reference-data.service';
import { cities, countries } from './reference-data.data';

const chain = (result: unknown) => {
  const q: any = {};
  for (const m of ['find', 'sort', 'skip', 'limit', 'lean', 'select']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
};

function makeModel(records: any[], total = records.length) {
  const query = chain(records);
  return {
    query,
    find: jest.fn(() => query),
    findOne: jest.fn(),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(total) })),
  };
}

const egypt = { _id: new Types.ObjectId(), code: 'EG', name: 'Egypt', currency: 'EGP' };
const cairo = { _id: new Types.ObjectId(), cityId: 'cairo', name: 'Cairo', countryCode: 'EG' };

describe('ReferenceDataService (BE-1)', () => {
  it('lists countries with id, code, name, currency in the GEN-05 page shape', async () => {
    const countryModel = makeModel([egypt], 8);
    const service = new ReferenceDataService(countryModel as any, makeModel([]) as any);

    const res = await service.listCountries(1);

    expect(res).toEqual({
      items: [{ id: egypt._id.toString(), code: 'EG', name: 'Egypt', currency: 'EGP' }],
      total: 8,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    // only the official GEN-12 countries, sorted by name, 10 per page
    expect(countryModel.find).toHaveBeenCalledWith({ code: { $in: countries.map((c) => c.code) } });
    expect(countryModel.query.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(countryModel.query.limit).toHaveBeenCalledWith(10);
  });

  it('skips the earlier pages', async () => {
    const countryModel = makeModel([], 25);
    const service = new ReferenceDataService(countryModel as any, makeModel([]) as any);
    const res = await service.listCountries(3);
    expect(countryModel.query.skip).toHaveBeenCalledWith(20);
    expect(res.totalPages).toBe(3);
  });

  it('lists only the official cities when no country is given', async () => {
    const cityModel = makeModel([cairo]);
    const service = new ReferenceDataService(makeModel([]) as any, cityModel as any);

    const res = await service.listCities(1);

    expect(cityModel.find).toHaveBeenCalledWith({ cityId: { $in: cities.map((c) => c.city_id) } });
    expect(res.items).toEqual([{ id: cairo._id.toString(), cityId: 'cairo', name: 'Cairo', countryCode: 'EG' }]);
  });

  it('filters cities by country code (any letter case)', async () => {
    const cityModel = makeModel([cairo]);
    const service = new ReferenceDataService(makeModel([]) as any, cityModel as any);

    await service.listCities(1, 'eg');

    expect(cityModel.find).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'EG' }));
  });

  it('filters cities by country id', async () => {
    const countryModel = makeModel([]);
    countryModel.findOne.mockReturnValue(chain({ code: 'EG' }));
    const cityModel = makeModel([cairo]);
    const service = new ReferenceDataService(countryModel as any, cityModel as any);

    await service.listCities(1, egypt._id.toString());

    expect(cityModel.find).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'EG' }));
  });

  it('returns an empty page for an unknown country', async () => {
    const countryModel = makeModel([]);
    countryModel.findOne.mockReturnValue(chain(null));
    const cityModel = makeModel([cairo]);
    const service = new ReferenceDataService(countryModel as any, cityModel as any);

    expect(await service.listCities(1, 'ZZ')).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
    expect(await service.listCities(1, new Types.ObjectId().toString())).toMatchObject({ items: [], total: 0 });
    expect(cityModel.find).not.toHaveBeenCalled();
  });
});

describe('ListCitiesQueryDto (BE-1)', () => {
  const errorsFor = async (query: Record<string, unknown>) =>
    (await validate(plainToInstance(ListCitiesQueryDto, query))).map((e) => e.property);

  it('accepts no filter, a country code or a country id', async () => {
    expect(await errorsFor({})).toEqual([]);
    expect(await errorsFor({ country: 'EG', page: '2' })).toEqual([]);
    expect(await errorsFor({ country: '6aeeecf022a36c4e4cf3014e' })).toEqual([]);
  });

  it('rejects a bad country or page', async () => {
    expect(await errorsFor({ country: 'Egypt' })).toEqual(['country']);
    expect(await errorsFor({ page: '0' })).toEqual(['page']);
    expect(await errorsFor({ page: 'abc' })).toEqual(['page']);
  });
});
