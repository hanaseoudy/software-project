"use client";

// PAYC-1 (PAY-01): the shared card payment form, used on
// /checkout/flight/[id]/pay and /checkout/hotel/[id]/pay.
//
//   <StripeCardForm bookingType="flight" bookingId={id} />
//
// 1. POST /api/payments            -> Stripe clientSecret (amount comes from the booking, PAY-04 USD)
// 2. Stripe Elements collects the card and confirms it in the browser
//    (card details go straight to Stripe, never to our backend).
// 3. Card error -> shown, with a "Try again" button -> POST /api/payments/:id/retry
// 4. Stripe accepted the card -> wait until GET /api/payments/:id says "succeeded"
//    (the backend confirms the booking only from the verified Stripe webhook),
//    then go to the booking's confirmation page.

import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeCardElementChangeEvent, StripeCardElementOptions, StripeElementsOptions } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { isApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";

import {
  getPayment,
  retryPayment,
  startPayment,
  waitForPayment,
  type BookingType,
  type Payment,
  type PaymentSession,
} from "./payment-api";
import { getStripe, readStripeConfig } from "./stripe";

/** How long to wait for the backend to see Stripe's result (the webhook). */
export const PAYMENT_POLLING = {
  /** After Stripe accepted the card: wait for "succeeded". */
  confirm: { intervalMs: 2000, timeoutMs: 60_000 },
  /** Before a retry: wait until the backend has marked the payment "failed". */
  failure: { intervalMs: 1500, timeoutMs: 15_000 },
  /** A start that collides with another start of the same payment (409, still pending) is asked again. */
  start: { attempts: 4, delayMs: 1000 },
};

export interface StripeCardFormProps {
  bookingType: BookingType;
  /** The flight booking or hotel reservation id (Pending Payment, policies accepted). */
  bookingId: string;
  /** Where to go after the payment succeeded. Defaults to the booking's confirmation page. */
  confirmationHref?: string;
}

// GEN-17: the card field is an iframe from Stripe, so DM Sans is loaded into it here.
const ELEMENTS_OPTIONS: StripeElementsOptions = {
  fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" }],
};

export function confirmationPathFor(bookingType: BookingType, bookingId: string): string {
  const id = encodeURIComponent(bookingId);
  return bookingType === "flight" ? `/flight-bookings/${id}/confirmation` : `/hotel-bookings/${id}/confirmation`;
}

export function StripeCardForm(props: StripeCardFormProps) {
  const config = readStripeConfig();
  const stripePromise = config.ok ? getStripe(config.key) : null;

  if (!config.ok || !stripePromise) {
    return (
      <PaymentCard>
        <Message tone="error">{config.ok ? "Card payments are not available." : config.message}</Message>
      </PaymentCard>
    );
  }

  return (
    <Elements stripe={stripePromise} options={ELEMENTS_OPTIONS}>
      <PaymentFlow {...props} />
    </Elements>
  );
}

type Phase =
  | "starting" // creating the payment
  | "ready" // card form shown
  | "paying" // Stripe is confirming the card
  | "failed" // card error; retry offered
  | "retrying"
  | "confirming" // waiting for GET /payments/:id to say "succeeded"
  | "slow" // still no result after the waiting time
  | "blocked" // this booking cannot be paid (hold expired, already refunded...)
  | "done";

const REFUNDED_MESSAGE =
  "Your payment was received, but the booking could not be confirmed (for example, the hold ended or the provider is no longer available). The full amount is being refunded to your card.";
const EXPIRED_MESSAGE = "The booking hold has expired, so this booking can no longer be paid. Please start a new booking.";
const SLOW_MESSAGE =
  "Stripe accepted your card, but we haven't received the confirmation yet. Your card will not be charged twice. Please check again in a moment.";

function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) || error instanceof Error ? error.message || fallback : fallback;
}

function PaymentFlow({ bookingType, bookingId, confirmationHref }: StripeCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCancelled = useCallback(() => !mounted.current, []);

  // The payment id is the booking id (one payment per booking).
  const paymentId = payment?.id ?? bookingId;
  const target = confirmationHref ?? confirmationPathFor(bookingType, bookingId);

  const show = useCallback((next: Phase, text: string | null = null) => {
    if (!mounted.current) return;
    setPhase(next);
    setMessage(text);
  }, []);

  const openSession = useCallback(
    (session: PaymentSession) => {
      setPayment(session);
      setClientSecret(session.clientSecret);
      show("ready");
    },
    [show],
  );

  /** Shows what the backend says about this payment. */
  const applyStatus = useCallback(
    (current: Payment, pendingText: string) => {
      setPayment(current);
      switch (current.status) {
        case "succeeded":
          return show("done");
        case "failed":
          return show("failed", current.failureReason || "Your payment failed.");
        case "refunded":
        case "partially_refunded":
          return show("blocked", REFUNDED_MESSAGE);
        case "expired":
          return show("blocked", EXPIRED_MESSAGE);
        default:
          return show("blocked", pendingText);
      }
    },
    [show],
  );

  // 1. Start the payment (POST /api/payments).
  useEffect(() => {
    let active = true;
    (async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const session = await startPayment(bookingType, bookingId);
          if (active) openSession(session);
          return;
        } catch (error) {
          if (!active) return;
          const text = errorMessage(error, "We couldn't start the payment. Please try again.");
          if (!isApiError(error) || error.status !== 409) return show("blocked", text);
          // 409: already paid, last payment failed, hold expired, or another tab is starting
          // the same payment right now. Show the real state.
          let existing: Payment;
          try {
            existing = await getPayment(bookingId);
          } catch {
            return active ? show("blocked", text) : undefined; // no payment yet: the backend's message
          }
          if (!active) return;
          if (existing.status === "pending" && attempt < PAYMENT_POLLING.start.attempts) {
            // The other start finishes in a moment; asking again returns the same PaymentIntent.
            await new Promise((resolve) => setTimeout(resolve, PAYMENT_POLLING.start.delayMs));
            if (!active) return;
            continue;
          }
          return applyStatus(existing, text);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [bookingType, bookingId, openSession, applyStatus, show]);

  // 4. Wait for the backend to confirm (only the verified Stripe webhook confirms a booking).
  const waitForConfirmation = useCallback(async () => {
    show("confirming");
    try {
      const result = await waitForPayment(paymentId, (p) => p.status !== "pending", {
        ...PAYMENT_POLLING.confirm,
        isCancelled,
      });
      if (isCancelled()) return;
      if (!result) return show("slow", SLOW_MESSAGE);
      applyStatus(result, SLOW_MESSAGE);
    } catch (error) {
      show("blocked", errorMessage(error, "We couldn't check the payment status."));
    }
  }, [paymentId, isCancelled, applyStatus, show]);

  useEffect(() => {
    if (phase === "done") router.replace(target);
  }, [phase, router, target]);

  // 2. Confirm the card with Stripe.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || !clientSecret || phase !== "ready") return;
    const card = elements.getElement(CardElement);
    if (!card) return;

    show("paying");
    setCardError(null);
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    });
    if (!mounted.current) return;

    if (error) {
      if (error.payment_intent?.status === "succeeded") return waitForConfirmation();
      if (error.type === "validation_error") {
        // Incomplete or invalid card details: nothing was charged, just fix the card.
        setCardError(error.message ?? "Please check your card details.");
        return show("ready");
      }
      return show("failed", error.message ?? "Your card could not be charged.");
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      return waitForConfirmation();
    }
    show("failed", "The payment was not completed. Please try again.");
  }

  // 3. Retry (POST /api/payments/:id/retry).
  async function handleRetry() {
    show("retrying");
    try {
      // The backend marks the payment "failed" when Stripe's webhook arrives; wait for it.
      const current = await waitForPayment(paymentId, (p) => p.status !== "pending", {
        ...PAYMENT_POLLING.failure,
        isCancelled,
      });
      if (isCancelled()) return;
      if (!current) {
        return show("failed", "We're still waiting for Stripe to report the failed payment. Please try again in a few seconds.");
      }
      if (current.status !== "failed") return applyStatus(current, EXPIRED_MESSAGE);

      const session = await retryPayment(paymentId);
      if (isCancelled()) return;
      elements?.getElement(CardElement)?.clear();
      setCardComplete(false);
      setCardError(null);
      openSession(session);
    } catch (error) {
      if (isCancelled()) return;
      const text = errorMessage(error, "We couldn't restart the payment.");
      if (isApiError(error) && error.status === 409) {
        try {
          return applyStatus(await getPayment(paymentId), text);
        } catch {
          // fall through
        }
      }
      show("failed", text);
    }
  }

  function handleCardChange(event: StripeCardElementChangeEvent) {
    setCardComplete(event.complete);
    setCardError(event.error?.message ?? null);
  }

  const cardOptions = useCardOptions(phase !== "ready");
  const amount = payment ? formatMoney(payment.amount, payment.currency) : null;
  const showForm = phase === "ready" || phase === "paying" || phase === "failed" || phase === "retrying";
  const busy = phase === "starting" || phase === "paying" || phase === "retrying" || phase === "confirming";

  return (
    <PaymentCard amount={amount} busy={busy}>
      {phase === "starting" && <Message tone="status">Preparing your payment…</Message>}

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label id="card-details-label">Card details</Label>
            <div
              className="rounded-base border-2 border-border bg-background px-3 py-3"
              role="group"
              aria-labelledby="card-details-label"
            >
              <CardElement options={cardOptions} onChange={handleCardChange} />
            </div>
            {cardError && <Message tone="error">{cardError}</Message>}
          </div>

          {phase === "failed" && message && <Message tone="error">{message}</Message>}

          {phase === "failed" ? (
            <Button type="button" onClick={handleRetry}>
              Try again
            </Button>
          ) : (
            <Button type="submit" disabled={!stripe || !elements || !cardComplete || phase !== "ready"}>
              {phase === "paying" ? "Paying…" : phase === "retrying" ? "Getting ready…" : amount ? `Pay ${amount}` : "Pay"}
            </Button>
          )}

          <p className="text-sm">
            Stripe test mode: use card 4242 4242 4242 4242 with any future date and any CVC. Your card details go
            directly to Stripe.
          </p>
        </form>
      )}

      {phase === "confirming" && <Message tone="status">Confirming your payment…</Message>}

      {phase === "slow" && (
        <div className="flex flex-col gap-4">
          <Message tone="status">{message}</Message>
          <Button type="button" variant="secondary" onClick={() => void waitForConfirmation()}>
            Check again
          </Button>
        </div>
      )}

      {phase === "blocked" && <Message tone="error">{message}</Message>}

      {phase === "done" && <Message tone="status">Payment confirmed. Taking you to your booking confirmation…</Message>}
    </PaymentCard>
  );
}

function PaymentCard({ amount, busy, children }: { amount?: string | null; busy?: boolean; children: ReactNode }) {
  return (
    <Card aria-busy={busy || undefined}>
      <CardHeader>
        <CardTitle className="font-display text-xl">Pay by card</CardTitle>
        {amount && <CardDescription>Amount to pay: {amount}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Message({ tone, children }: { tone: "error" | "status"; children: ReactNode }) {
  return tone === "error" ? (
    <p role="alert" className="text-sm font-heading text-main">
      {children}
    </p>
  ) : (
    <p role="status" className="text-sm">
      {children}
    </p>
  );
}

/** Stripe's card field runs in an iframe, so it gets the theme colours as values (GEN-17 tokens). */
function useCardOptions(disabled: boolean): StripeCardElementOptions {
  // Read once in the browser; the card field itself only exists in the browser.
  const colors = useMemo(() => {
    if (typeof window === "undefined") return {};
    const css = getComputedStyle(document.documentElement);
    const read = (name: string) => css.getPropertyValue(name).trim() || undefined;
    return { text: read("--foreground"), error: read("--main") };
  }, []);

  return useMemo(
    () => ({
      hidePostalCode: true,
      // No "Save with Link" button: it is not part of PAY-01 and is outside the GEN-17 palette.
      disableLink: true,
      disabled,
      style: {
        base: {
          color: colors.text,
          iconColor: colors.text,
          fontSize: "16px",
          fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
          fontWeight: "500",
          "::placeholder": { color: colors.text },
        },
        invalid: { color: colors.error, iconColor: colors.error },
      },
    }),
    [colors, disabled],
  );
}
