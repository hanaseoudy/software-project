import { readStripeConfig } from "./stripe";

describe("readStripeConfig (PAYC-1)", () => {
  it("needs NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", () => {
    expect(readStripeConfig(undefined)).toEqual({ ok: false, message: expect.stringContaining("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") });
    expect(readStripeConfig("  ")).toMatchObject({ ok: false });
  });

  it("only accepts a Stripe test key", () => {
    expect(readStripeConfig("pk_live_123")).toEqual({ ok: false, message: expect.stringContaining("pk_test_") });
    expect(readStripeConfig("sk_test_123")).toMatchObject({ ok: false });
    expect(readStripeConfig(" pk_test_123 ")).toEqual({ ok: true, key: "pk_test_123" });
  });
});
