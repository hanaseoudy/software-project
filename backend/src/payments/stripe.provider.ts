import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Injection token for the Stripe client (PAY-01). */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

const logger = new Logger('StripeProvider');

/**
 * PAY-01: Stripe test-mode client built from STRIPE_SECRET_KEY.
 * Project description 6.4 requires Stripe test mode, so only keys starting with
 * "sk_test_" are accepted; any other key (e.g. a live "sk_live_" key) is refused and
 * can never charge real cards. Returns null when there is no usable key, so the rest
 * of the app still starts; payment routes then answer 503.
 */
export function createStripeClient(key: string | undefined): Stripe | null {
  if (!key) return null;
  if (!key.startsWith('sk_test_')) {
    logger.error('STRIPE_SECRET_KEY refused: only Stripe test-mode keys (sk_test_...) are allowed. Payments are disabled.');
    return null;
  }
  return new Stripe(key);
}

export const stripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => createStripeClient(config.get<string>('STRIPE_SECRET_KEY')),
};
