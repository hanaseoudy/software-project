import { createStripeClient } from './stripe.provider';

describe('createStripeClient (PAY-01, project description 6.4: test mode only)', () => {
  it('accepts a Stripe test key', () => {
    const client = createStripeClient('sk_test_123');
    expect(client).not.toBeNull();
    expect(typeof client!.paymentIntents.create).toBe('function');
  });

  it.each(['sk_live_123', 'rk_live_123', 'pk_test_123', 'something-else'])('refuses %s', (key) => {
    expect(createStripeClient(key)).toBeNull();
  });

  it('returns null when no key is set', () => {
    expect(createStripeClient(undefined)).toBeNull();
    expect(createStripeClient('')).toBeNull();
  });
});
