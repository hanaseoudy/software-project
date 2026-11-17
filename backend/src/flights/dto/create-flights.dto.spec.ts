import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFlightsDto } from './create-flights.dto';

const messagesFor = async (property: string, body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(CreateFlightsDto, body));
  return errors.filter((e) => e.property === property).flatMap((e) => Object.values(e.constraints ?? {}));
};

describe('CreateFlightsDto airport messages (FLT-03)', () => {
  it('names the departure airport when departureAirport is wrong', async () => {
    expect(await messagesFor('departureAirport', { departureAirport: 'CA', arrivalAirport: 'DXB' })).toEqual([
      'Departure airport must be a 3-letter IATA code',
    ]);
  });

  it('names the arrival airport when arrivalAirport is wrong', async () => {
    expect(await messagesFor('arrivalAirport', { departureAirport: 'CAI', arrivalAirport: 'DX' })).toEqual([
      'Arrival airport must be a 3-letter IATA code',
    ]);
  });
});
