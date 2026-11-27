import { formatMoney, PLATFORM_CURRENCY } from "./money";

describe("formatMoney (PAY-04)", () => {
  it("shows the currency code and the amount with 2 decimals", () => {
    expect(formatMoney(640)).toBe("USD 640.00");
    expect(formatMoney(0)).toBe("USD 0.00");
    expect(formatMoney(19.999)).toBe("USD 20.00");
  });

  it("uses the platform currency by default", () => {
    expect(PLATFORM_CURRENCY).toBe("USD");
  });

  it("adds thousands separators", () => {
    expect(formatMoney(1250.5)).toBe("USD 1,250.50");
    expect(formatMoney(1000000)).toBe("USD 1,000,000.00");
  });

  it("accepts numeric strings from the API", () => {
    expect(formatMoney("99.9")).toBe("USD 99.90");
  });

  it("shows refunds and negative amounts", () => {
    expect(formatMoney(-12.5)).toBe("USD -12.50");
  });

  it("uses the currency the API returns", () => {
    expect(formatMoney(640, "usd")).toBe("USD 640.00");
    expect(formatMoney(640, "JPY")).toBe("JPY 640");
  });

  it("never shows NaN", () => {
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney("")).toBe("—");
    expect(formatMoney("abc")).toBe("—");
    expect(formatMoney(Number.NaN)).toBe("—");
  });
});
