import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Injection token for the Stripe client (PAY-01). */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * PAY-01: Stripe test-mode client built from STRIPE_SECRET_KEY.
 * Returns null when the key is not set, so the rest of the app still starts
 * for teammates without Stripe keys; payment routes then answer 503.
 */
export const stripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    return key ? new Stripe(key) : null;
  },
};
