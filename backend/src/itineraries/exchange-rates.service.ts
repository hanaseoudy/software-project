import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Model } from 'mongoose';
import {
  ExchangeRateSnapshot,
  ExchangeRateSnapshotDocument,
} from './schemas/exchange-rate-snapshot.schema';

const SNAPSHOT_ID = 'fxratesapi:USD';
const BASE = 'USD';
const RECOVERY_COOLDOWN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;
const COLD_CACHE_WAIT_MS = 1_000;
const MAX_REFRESH_ATTEMPTS = 2;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

interface RateSet {
  providerTimestamp: Date;
  rateDate: string;
  fetchedAt: Date;
  rates: Record<string, string>;
}

interface SnapshotState extends Omit<ExchangeRateSnapshot, 'lastGood'> {
  lastGood?: RateSet;
}

export interface BudgetRateSet {
  rates: Record<string, string>;
  rateDate: string;
  status: 'fresh' | 'cached_fallback';
}

function validRate(value: unknown): value is number {
  return typeof value === 'number' && value >= 1e-12 && value <= 1e12;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

class RetryableProviderError extends Error {}

@Injectable()
export class ExchangeRatesService {
  constructor(
    @InjectModel(ExchangeRateSnapshot.name)
    private readonly snapshots: Model<ExchangeRateSnapshotDocument>,
    private readonly config: ConfigService,
  ) {}

  async getRates(
    supported: string[],
    sources: string[],
    target: string,
  ): Promise<BudgetRateSet> {
    const now = new Date();
    const day = utcDate(now);
    const settings = this.providerSettings(supported);
    let state = await this.read();

    if (settings && this.canClaim(state, day, now)) {
      const token = randomUUID();
      const deadline = performance.now() + RECOVERY_COOLDOWN_MS;
      const claim = await this.claim(state, day, token);
      state = claim
        ? await this.refresh(claim, token, deadline, settings, supported)
        : await this.read();
    }

    if (
      !this.covers(state?.lastGood, sources, target) &&
      state?.status === 'pending'
    ) {
      const deadline = Date.now() + COLD_CACHE_WAIT_MS;
      // Bound the number of reads even if an instance's clock steps backward.
      for (let poll = 0; poll < 10 && Date.now() < deadline; poll++) {
        await delay(100);
        state = await this.read();
        if (
          this.covers(state?.lastGood, sources, target) ||
          state?.status !== 'pending'
        )
          break;
      }
    }

    const lastGood = state?.lastGood;
    if (!this.covers(lastGood, sources, target)) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'EXCHANGE_RATES_UNAVAILABLE',
        message: 'Exchange rates are unavailable for this budget',
        missingPairs: sources
          .filter((source) => !this.covers(lastGood, [source], target))
          .map((source) => ({ source, target })),
      });
    }

    return {
      rates: lastGood.rates,
      rateDate: lastGood.rateDate,
      status:
        state?.status === 'succeeded' &&
        state.refreshDay === utcDate(new Date())
          ? 'fresh'
          : 'cached_fallback',
    };
  }

  private read() {
    return this.snapshots
      .findById(SNAPSHOT_ID)
      .read('primary')
      .readConcern('majority')
      .lean<SnapshotState | null>()
      .exec();
  }

  private canClaim(state: SnapshotState | null, day: string, now: Date) {
    if (state?.refreshDay && state.refreshDay > day) return false;
    if (
      state?.status === 'pending' &&
      state.retryAfter &&
      state.retryAfter > now
    )
      return false;
    if (state?.refreshDay !== day) return true;
    return (
      state.status !== 'succeeded' &&
      (state.attempts ?? 0) < MAX_REFRESH_ATTEMPTS &&
      (!state.retryAfter || state.retryAfter <= now)
    );
  }

  private async claim(state: SnapshotState | null, day: string, token: string) {
    const attempts = state?.refreshDay === day ? (state.attempts ?? 0) + 1 : 1;
    if (!state) {
      try {
        await this.snapshots
          .updateOne(
            { _id: SNAPSHOT_ID },
            { $setOnInsert: { _id: SNAPSHOT_ID } },
            { upsert: true, writeConcern: { w: 'majority' } },
          )
          .exec();
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
    }

    // MongoDB checks the UTC day and cooldown against its own clock. Compare
    // the prior token and status to prevent races with another claim or publish.
    const timingChecks: object[] = [
      {
        $eq: [
          day,
          {
            $dateToString: {
              date: '$$NOW',
              format: '%Y-%m-%d',
              timezone: 'UTC',
            },
          },
        ],
      },
    ];
    if (state?.status === 'pending' || state?.refreshDay === day) {
      timingChecks.push({ $lte: ['$retryAfter', '$$NOW'] });
    }

    return this.snapshots
      .findOneAndUpdate(
        {
          _id: SNAPSHOT_ID,
          claimToken: state?.claimToken ?? null,
          refreshDay: state?.refreshDay ?? null,
          status: state?.status ?? null,
          $expr: { $and: timingChecks },
        },
        [
          {
            $set: {
              refreshDay: day,
              attempts,
              claimToken: token,
              status: 'pending',
              retryAfter: { $add: ['$$NOW', RECOVERY_COOLDOWN_MS] },
            },
          },
        ],
        {
          updatePipeline: true,
          returnDocument: 'after',
          writeConcern: { w: 'majority' },
        },
      )
      .lean<SnapshotState | null>()
      .exec();
  }

  private providerSettings(supported: string[]) {
    const endpoint = this.config.get<string>('FX_RATES_API_URL');
    const key = this.config.get<string>('FX_RATES_API_KEY')?.trim();
    if (!endpoint || !key) return null;

    try {
      const url = new URL(endpoint);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return null;
      url.searchParams.set('base', BASE);
      url.searchParams.set('resolution', '1d');
      url.searchParams.set('currencies', supported.join(','));
      url.searchParams.set('api_key', key);
      return url;
    } catch {
      return null;
    }
  }

  private async refresh(
    claim: SnapshotState,
    token: string,
    deadline: number,
    url: URL,
    supported: string[],
  ) {
    let lastGood: RateSet | undefined;
    try {
      const body = await this.fetchRates(url, deadline);
      lastGood = this.parseRates(body, supported, claim.lastGood, new Date());
    } catch {
      // Provider errors may contain the configured URL. Keep diagnostics free
      // of credentials and preserve the previously published rate set.
    }

    // A superseded worker cannot publish or shorten another worker's cooldown.
    try {
      await this.snapshots
        .updateOne(
          {
            _id: SNAPSHOT_ID,
            claimToken: token,
            status: 'pending',
            $expr: { $gt: ['$retryAfter', '$$NOW'] },
          },
          {
            $set: lastGood
              ? { status: 'succeeded', lastGood }
              : { status: 'failed' },
          },
          { writeConcern: { w: 'majority' } },
        )
        .exec();
      return await this.read();
    } catch {
      // A failed or uncertain publication never serves unpublished rates.
      return claim;
    }
  }

  private async fetchRates(url: URL, deadline: number): Promise<unknown> {
    try {
      return await this.fetchOnce(url, deadline);
    } catch (error) {
      if (!(error instanceof RetryableProviderError)) throw error;
      await delay(100);
      return this.fetchOnce(url, deadline);
    }
  }

  private async fetchOnce(url: URL, deadline: number): Promise<unknown> {
    const remaining = deadline - performance.now();
    if (remaining < REQUEST_TIMEOUT_MS)
      throw new Error('Refresh claim expired');
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { signal, redirect: 'error' });
    } catch {
      throw new RetryableProviderError();
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 500) throw new RetryableProviderError();
      throw new Error('Provider request failed');
    }
    try {
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw new RetryableProviderError();
      throw error;
    }
  }

  private parseRates(
    body: unknown,
    supported: string[],
    previous: RateSet | undefined,
    now: Date,
  ): RateSet {
    const payload = body as {
      success?: unknown;
      base?: unknown;
      timestamp?: unknown;
      date?: unknown;
      rates?: Record<string, unknown>;
    } | null;
    if (
      !payload ||
      payload.success !== true ||
      payload.base !== BASE ||
      typeof payload.timestamp !== 'number' ||
      !Number.isSafeInteger(payload.timestamp) ||
      typeof payload.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
        payload.date,
      ) ||
      !payload.rates ||
      typeof payload.rates !== 'object' ||
      Array.isArray(payload.rates) ||
      payload.rates[BASE] !== 1
    )
      throw new Error('Invalid FX provider payload');

    const timestamp = payload.timestamp * 1_000;
    const date = new Date(timestamp);
    if (
      timestamp <= 0 ||
      timestamp > now.getTime() + MAX_FUTURE_SKEW_MS ||
      Date.parse(payload.date) !== timestamp ||
      (payload.date.length === 20
        ? payload.date.slice(0, -1) + '.000Z'
        : payload.date) !== date.toISOString() ||
      (previous?.providerTimestamp instanceof Date &&
        timestamp < previous.providerTimestamp.getTime())
    ) {
      throw new Error('Invalid or regressing provider timestamp');
    }

    const rates: Record<string, string> = { [BASE]: '1' };
    for (const code of supported) {
      const rate = payload.rates[code];
      if (!validRate(rate))
        throw new Error('Missing or unsafe FX provider rate');
      rates[code] = String(rate);
    }
    return {
      providerTimestamp: date,
      rateDate: utcDate(date),
      fetchedAt: now,
      rates,
    };
  }

  private covers(
    set: RateSet | undefined,
    sources: string[],
    target: string,
  ): set is RateSet {
    if (
      !set ||
      !(set.providerTimestamp instanceof Date) ||
      !Number.isFinite(set.providerTimestamp.getTime()) ||
      set.rateDate !== utcDate(set.providerTimestamp) ||
      set.rates?.[BASE] !== '1'
    )
      return false;
    return [target, ...sources].every((code) => {
      const rate = set.rates?.[code];
      return (
        typeof rate === 'string' &&
        validRate(Number(rate)) &&
        String(Number(rate)) === rate
      );
    });
  }
}
