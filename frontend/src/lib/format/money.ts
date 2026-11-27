// PAY-04: all flight and hotel prices, payments and refunds use a single
// platform currency. Show them as "<currency code> <amount>", e.g. "USD 640.00".
// Booking prices are NEVER converted to the user's preferred currency; that
// conversion exists only for itinerary budgets (ITN-18), which have their own display.

/** The platform currency (backend/src/common/constants/currency.constants.ts). */
export const PLATFORM_CURRENCY = "USD";

const LOCALE = "en-US";

/**
 * Formats a booking price, payment or refund.
 *   formatMoney(640)           -> "USD 640.00"
 *   formatMoney(1250.5)        -> "USD 1,250.50"
 *   formatMoney("99.9")        -> "USD 99.90"
 *   formatMoney(640, "USD")    -> "USD 640.00" (pass the currency the API returns, if any)
 * Returns "—" for a missing or non-numeric amount so a page never shows "NaN".
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = PLATFORM_CURRENCY,
): string {
  if (amount === null || amount === undefined) return "—";
  const value = typeof amount === "string" ? (amount.trim() ? Number(amount) : Number.NaN) : amount;
  if (!Number.isFinite(value)) return "—";

  const code = currency.trim().toUpperCase();
  // Uses the currency's usual number of decimals (2 for USD).
  let digits = 2;
  try {
    digits = new Intl.NumberFormat(LOCALE, { style: "currency", currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    // Unknown currency code: keep 2 decimals.
  }

  const number = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  return `${code} ${number}`;
}
