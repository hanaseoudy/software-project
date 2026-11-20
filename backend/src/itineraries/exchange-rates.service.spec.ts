import { ExchangeRatesService } from './exchange-rates.service';

const supported = ['USD', 'EUR', 'EGP'];
const instant = new Date('2024-02-29T10:00:00.000Z');

function payload(date = '2024-02-29T00:00:00.000Z') {
  return {
    success: true,
    base: 'USD',
    timestamp: Date.parse(date) / 1000,
    date,
    rates: { USD: 1, EUR: 0.5, EGP: 2 },
  };
}

describe('ITN-18 provider and cache behavior', () => {
  let state: Record<string, unknown> | null;
  let claim: jest.Mock;
  let update: jest.Mock;
  let call: jest.SpiedFunction<typeof fetch>;
  let service: ExchangeRatesService;
  let config: jest.Mock;
  const get = () => service.getRates(supported, ['USD'], 'EUR');

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
    jest.setSystemTime(instant);
    state = null;
    const lean = (value: unknown) => ({
      lean: () => ({ exec: async () => value }),
    });
    claim = jest.fn((_, [{ $set }]) => {
      state = { ...state, ...$set, retryAfter: new Date(Date.now() + 60_000) };
      return lean(state);
    });
    update = jest.fn((_, change) => ({
      exec: async () => {
        if (change.$set) state = { ...state, ...change.$set };
      },
    }));
    const model = {
      findById: () => ({ read: () => ({ readConcern: () => lean(state) }) }),
      findOneAndUpdate: claim,
      updateOne: update,
    };
    config = jest.fn((key) =>
      key.endsWith('_KEY') ? 'test-key' : 'https://fx.example.test/latest',
    );
    service = new ExchangeRatesService(
      model as never,
      { get: config } as never,
    );
    call = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => Response.json(payload()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('fetches one full provider response on leap day, reuses it and refreshes after midnight UTC', async () => {
    await expect(get()).resolves.toEqual({
      rates: { USD: '1', EUR: '0.5', EGP: '2' },
      rateDate: '2024-02-29',
      status: 'fresh',
    });
    await get();
    expect(call).toHaveBeenCalledTimes(1);
    const [url, options] = call.mock.calls[0];
    const request = url as URL;
    expect(Object.fromEntries(request.searchParams)).toEqual({
      base: 'USD',
      resolution: '1d',
      currencies: 'USD,EUR,EGP',
      api_key: 'test-key',
    });
    expect(options).toMatchObject({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    jest.setSystemTime(new Date('2024-03-01T00:00:00.000Z'));
    call.mockImplementation(async () =>
      Response.json(payload('2024-03-01T00:00:00Z')),
    );
    await expect(get()).resolves.toMatchObject({
      rateDate: '2024-03-01',
      status: 'fresh',
    });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['malformed JSON', () => new Response('{broken')],
    [
      'unsuccessful provider status',
      () => Response.json({ ...payload(), success: false }),
    ],
    ['wrong base', () => Response.json({ ...payload(), base: 'EUR' })],
    [
      'partial currencies',
      () => Response.json({ ...payload(), rates: { USD: 1, EUR: 0.5 } }),
    ],
    [
      'negative rate',
      () =>
        Response.json({ ...payload(), rates: { ...payload().rates, EUR: -1 } }),
    ],
    [
      'unsafe rate',
      () =>
        Response.json({
          ...payload(),
          rates: { ...payload().rates, EUR: 1e15 },
        }),
    ],
    [
      'regressing date',
      () => Response.json(payload('2024-02-28T00:00:00.000Z')),
    ],
    ['future date', () => Response.json(payload('2024-03-02T00:00:00.000Z'))],
    ['wrong timestamp', () => Response.json({ ...payload(), timestamp: 1 })],
    ['rate limiting', () => new Response(null, { status: 429 })],
  ])('keeps the previous complete set after %s', async (_, response) => {
    await get();
    const cached = state!.lastGood;
    jest.setSystemTime(new Date('2024-03-01T10:00:00.000Z'));
    call.mockImplementation(async () => response());
    await expect(get()).resolves.toMatchObject({
      status: 'cached_fallback',
      rateDate: '2024-02-29',
    });
    expect(state!.lastGood).toEqual(cached);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it.each(['timeout', 'HTTP 502'])(
    'retries %s only once and returns explicit 503 on a cold cache',
    async (failure) => {
      call.mockImplementation(async () => {
        if (failure === 'timeout')
          throw new DOMException('timed out', 'TimeoutError');
        return new Response(null, { status: 502 });
      });
      await expect(get()).rejects.toMatchObject({
        status: 503,
        response: {
          code: 'EXCHANGE_RATES_UNAVAILABLE',
          missingPairs: [{ source: 'USD', target: 'EUR' }],
        },
      });
      expect(call).toHaveBeenCalledTimes(2);
    },
  );

  it('uses only the available cache when config is missing and identifies uncached pairs', async () => {
    await get();
    config.mockReturnValue(undefined);
    jest.setSystemTime(new Date('2024-03-01T10:00:00.000Z'));
    await expect(get()).resolves.toMatchObject({ status: 'cached_fallback' });
    await expect(
      service.getRates([...supported, 'JPY'], ['USD', 'JPY'], 'EUR'),
    ).rejects.toMatchObject({
      status: 503,
      response: { missingPairs: [{ source: 'JPY', target: 'EUR' }] },
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('replaces an incomplete cache with a complete provider response', async () => {
    state = {
      refreshDay: '2024-02-28',
      status: 'succeeded',
      lastGood: { rates: { USD: '1' } },
    };
    await expect(get()).resolves.toMatchObject({
      rateDate: '2024-02-29',
      status: 'fresh',
    });
  });

  it('keeps serving the prior set if publication fails', async () => {
    await get();
    jest.setSystemTime(new Date('2024-03-01T10:00:00.000Z'));
    call.mockImplementation(async () =>
      Response.json(payload('2024-03-01T00:00:00Z')),
    );
    update.mockReturnValueOnce({
      exec: async () => {
        throw new Error('write interrupted');
      },
    });
    await expect(get()).resolves.toMatchObject({
      status: 'cached_fallback',
      rateDate: '2024-02-29',
    });
    expect(state!.lastGood).toMatchObject({ rateDate: '2024-02-29' });
  });
});
