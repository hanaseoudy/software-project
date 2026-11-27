// GEN-12: currencies come from a frontend copy of the backend's fixed SupportedCurrency
// list (agreed decision: no endpoint). Keep it equal to `SupportedCurrency` in
// backend/src/users/schemas/user.schema.ts; currencies.test.ts fails when they differ.

export interface CurrencyOption {
  code: string;
  name: string;
}

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { code: "EGP", name: "Egyptian Pound" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "AED", name: "UAE Dirham" },
  { code: "JPY", name: "Japanese Yen" },
];

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];
