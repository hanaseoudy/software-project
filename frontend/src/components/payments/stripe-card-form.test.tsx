import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

import { ApiError } from "@/lib/api";

import { PAYMENT_POLLING, StripeCardForm } from "./stripe-card-form";

// ---- fakes ---------------------------------------------------------------
const apiFetch = jest.fn();
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const readStripeConfig = jest.fn();
jest.mock("./stripe", () => ({
  readStripeConfig: () => readStripeConfig(),
  getStripe: () => Promise.resolve({}),
}));

const confirmCardPayment = jest.fn();
const clearCard = jest.fn();
const cardElement = { clear: clearCard };
let cardChange: ((event: { complete: boolean; error?: { message: string } }) => void) | undefined;
jest.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  CardElement: (props: { onChange: typeof cardChange; options: { disabled?: boolean } }) => {
    cardChange = props.onChange;
    return <div data-testid="card" data-disabled={String(!!props.options.disabled)} />;
  },
  useStripe: () => ({ confirmCardPayment }),
  useElements: () => ({ getElement: () => cardElement }),
}));

// ---- helpers -------------------------------------------------------------
const base = { id: "b1", bookingType: "flight", bookingId: "b1", amount: 250.5, currency: "USD" };
const session = (secret = "pi_1_secret_a") => ({ ...base, status: "pending", clientSecret: secret });

/** Routes apiFetch calls; GET /payments/b1 answers with the given statuses in order (last one repeats). */
function backend({ start, retry, statuses = ["pending"] }: { start?: unknown; retry?: unknown; statuses?: Array<string | Record<string, unknown>> }) {
  let n = 0;
  apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === "/payments" && init?.method === "POST") {
      if (start instanceof Error) throw start;
      return start ?? session();
    }
    if (path === "/payments/b1/retry") {
      if (retry instanceof Error) throw retry;
      return retry ?? session("pi_1_secret_b");
    }
    if (path === "/payments/b1") {
      const next = statuses[Math.min(n++, statuses.length - 1)];
      return typeof next === "string" ? { ...base, status: next } : { ...base, ...next };
    }
    throw new Error(`unexpected call ${path}`);
  });
}

async function fillCard() {
  await screen.findByTestId("card");
  act(() => cardChange?.({ complete: true }));
}

beforeAll(() => {
  PAYMENT_POLLING.confirm = { intervalMs: 1, timeoutMs: 200 };
  PAYMENT_POLLING.failure = { intervalMs: 1, timeoutMs: 200 };
  PAYMENT_POLLING.start = { attempts: 4, delayMs: 1 };
});

beforeEach(() => {
  jest.clearAllMocks();
  cardChange = undefined;
  readStripeConfig.mockReturnValue({ ok: true, key: "pk_test_123" });
});

// ---- tests ---------------------------------------------------------------
describe("<StripeCardForm /> (PAYC-1, PAY-01)", () => {
  it("starts the payment and shows the amount from the backend", async () => {
    backend({});
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);

    expect(apiFetch).toHaveBeenCalledWith("/payments", { method: "POST", json: { bookingType: "flight", bookingId: "b1" } });
    const pay = await screen.findByRole("button", { name: "Pay USD 250.50" });
    expect(screen.getByText("Amount to pay: USD 250.50")).toBeInTheDocument();
    expect(pay).toBeDisabled(); // until the card is complete
    await fillCard();
    expect(pay).toBeEnabled();
  });

  it("sends one POST /payments even when React starts the component twice (development Strict Mode)", async () => {
    backend({});
    render(
      <StrictMode>
        <StripeCardForm bookingType="flight" bookingId="b1" />
      </StrictMode>,
    );

    await screen.findByRole("button", { name: "Pay USD 250.50" });
    expect(apiFetch.mock.calls.filter(([p]) => p === "/payments")).toHaveLength(1);
  });

  it("asks again when another start of the same payment is still running (409, pending)", async () => {
    let starts = 0;
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/payments") {
        starts += 1;
        if (starts === 1) throw new ApiError(409, "A payment for this booking is already being started; try again");
        return session();
      }
      if (path === "/payments/b1") return { ...base, status: "pending" };
      throw new Error(`unexpected call ${path}`);
    });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);

    await screen.findByRole("button", { name: "Pay USD 250.50" });
    expect(starts).toBe(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirms the card with Stripe, waits for the backend, then opens the flight confirmation page", async () => {
    backend({ statuses: ["pending", "pending", "succeeded"] });
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);
    await fillCard();

    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/flight-bookings/b1/confirmation"));
    expect(confirmCardPayment).toHaveBeenCalledWith("pi_1_secret_a", { payment_method: { card: cardElement } });
    // Only redirected after GET /payments/b1 said "succeeded".
    expect(apiFetch.mock.calls.filter(([p]) => p === "/payments/b1")).toHaveLength(3);
  });

  it("opens the hotel confirmation page for a hotel booking", async () => {
    backend({ start: { ...session(), bookingType: "hotel" }, statuses: ["succeeded"] });
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    render(<StripeCardForm bookingType="hotel" bookingId="b1" />);
    await fillCard();

    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/hotel-bookings/b1/confirmation"));
  });

  it("shows a card error and retries with POST /payments/:id/retry", async () => {
    backend({ statuses: ["pending", "failed"] });
    confirmCardPayment.mockResolvedValueOnce({ error: { type: "card_error", message: "Your card was declined." } });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);
    await fillCard();

    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your card was declined.");
    expect(screen.getByTestId("card")).toHaveAttribute("data-disabled", "true");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    // Waits until the backend marked the payment failed, then reopens it.
    await screen.findByRole("button", { name: "Pay USD 250.50" });
    expect(apiFetch).toHaveBeenCalledWith("/payments/b1/retry", { method: "POST" });
    expect(clearCard).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // The new attempt uses the clientSecret returned by the retry.
    confirmCardPayment.mockResolvedValueOnce({ paymentIntent: { status: "succeeded" } });
    backend({ retry: session("pi_1_secret_b"), statuses: ["succeeded"] });
    await fillCard();
    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/flight-bookings/b1/confirmation"));
    expect(confirmCardPayment).toHaveBeenLastCalledWith("pi_1_secret_b", { payment_method: { card: cardElement } });
  });

  it("keeps the form for incomplete card details (nothing was charged)", async () => {
    backend({});
    confirmCardPayment.mockResolvedValue({ error: { type: "validation_error", message: "Your card number is incomplete." } });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);
    await fillCard();

    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your card number is incomplete.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay USD 250.50" })).toBeEnabled();
  });

  it("shows Stripe's inline card errors while typing", async () => {
    backend({});
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);
    await screen.findByTestId("card");

    act(() => cardChange?.({ complete: false, error: { message: "Your card's expiration date is in the past." } }));

    expect(screen.getByRole("alert")).toHaveTextContent("Your card's expiration date is in the past.");
  });

  it("offers a retry when coming back to a booking whose last payment failed", async () => {
    backend({
      start: new ApiError(409, "The last payment failed; use the retry endpoint"),
      statuses: [{ status: "failed", failureReason: "Your card has insufficient funds." }],
    });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your card has insufficient funds.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("goes to the confirmation page when the booking is already paid", async () => {
    backend({ start: new ApiError(409, "This booking is already paid"), statuses: ["succeeded"] });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/flight-bookings/b1/confirmation"));
  });

  it("explains an automatic refund instead of confirming", async () => {
    backend({ statuses: ["refunded"] });
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);
    await fillCard();

    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets the user check again if the confirmation takes too long", async () => {
    backend({ statuses: ["pending"] });
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);
    await fillCard();

    fireEvent.click(screen.getByRole("button", { name: "Pay USD 250.50" }));

    const again = await screen.findByRole("button", { name: "Check again" });
    expect(replace).not.toHaveBeenCalled();
    backend({ statuses: ["succeeded"] });
    fireEvent.click(again);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/flight-bookings/b1/confirmation"));
  });

  it("shows the backend's message when the booking cannot be paid", async () => {
    backend({ start: new ApiError(403, "Accept the provider policies before paying") });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Accept the provider policies before paying");
    expect(screen.queryByTestId("card")).not.toBeInTheDocument();
  });

  it("shows a setup message when the Stripe key is missing", () => {
    readStripeConfig.mockReturnValue({ ok: false, message: "Card payments are not set up: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing." });
    render(<StripeCardForm bookingType="flight" bookingId="b1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
