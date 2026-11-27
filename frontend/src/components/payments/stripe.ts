// Loads Stripe.js once for the whole app (PAYC-1).
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a *publishable* key: it is meant to be public.
// Never put the secret key (sk_...) in a NEXT_PUBLIC_* variable.
import { loadStripe, type Stripe } from "@stripe/stripe-js";

export type StripeConfig = { ok: true; key: string } | { ok: false; message: string };

/** Checks the key without loading anything. Only Stripe test mode is allowed (project rule, PAY-01). */
export function readStripeConfig(key: string | undefined = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY): StripeConfig {
  const value = key?.trim();
  if (!value) {
    return { ok: false, message: "Card payments are not set up: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing." };
  }
  if (!value.startsWith("pk_test_")) {
    return { ok: false, message: "Card payments must use a Stripe test key (pk_test_...)." };
  }
  return { ok: true, key: value };
}

let stripePromise: Promise<Stripe | null> | null = null;

/** The shared Stripe.js instance (loaded on first use). */
export function getStripe(key: string): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}
