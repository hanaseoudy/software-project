import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

const check = async (body: object) => {
  const dto = plainToInstance(UpdateProfileDto, body);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors: Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})])) };
};

describe('UpdateProfileDto (ACC-09)', () => {
  it('accepts a full valid body and cleans the values', async () => {
    const { dto, errors } = await check({
      firstName: '  Nour ',
      lastName: 'Hossam',
      phoneNumber: '+20 100-123-4567',
      preferredCurrency: 'USD',
    });

    expect(errors).toEqual({});
    expect(dto.firstName).toBe('Nour');
    expect(dto.phoneNumber).toBe('+201001234567');
  });

  it('accepts a body with only some fields', async () => {
    expect((await check({ preferredCurrency: 'EUR' })).errors).toEqual({});
  });

  it('allows null to remove the phone number', async () => {
    expect((await check({ phoneNumber: null })).errors).toEqual({});
  });

  it('rejects empty or null names', async () => {
    const { errors } = await check({ firstName: '   ', lastName: null });

    expect(errors.firstName).toContain('First name cannot be empty');
    expect(errors.lastName).toEqual(expect.arrayContaining(['Last name must be text']));
  });

  it('rejects an invalid phone number', async () => {
    for (const phoneNumber of ['12', 'abc1234567', '+2010012345678901', 201001234567]) {
      expect((await check({ phoneNumber })).errors.phoneNumber).toContain(
        'Phone number must be 7 to 15 digits and may start with +',
      );
    }
  });

  it('rejects a currency outside the supported list', async () => {
    expect((await check({ preferredCurrency: 'BTC' })).errors.preferredCurrency).toContain(
      'Preferred currency must be one of: EGP, USD, EUR, GBP, SAR, AED, JPY',
    );
  });

  it('reports every invalid field at once so nothing is saved', async () => {
    const { errors } = await check({ firstName: 'Nour', phoneNumber: 'x', preferredCurrency: 'BTC' });

    expect(Object.keys(errors).sort()).toEqual(['phoneNumber', 'preferredCurrency']);
  });
});