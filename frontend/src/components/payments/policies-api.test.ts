import { describeCancellationTiers } from "./policies-api";

describe("describeCancellationTiers (PAYC-3, FLT-09 / HTL-10 rule)", () => {
  it("lists tiers from the earliest and ends with 'no refund' below the lowest threshold", () => {
    expect(
      describeCancellationTiers(
        [
          { days: 1, percent: 20 },
          { days: 7, percent: 80 },
        ],
        "departure",
      ),
    ).toEqual([
      "Cancelled at least 7 days before departure: 80% refund",
      "Cancelled at least 1 day before departure: 20% refund",
      "Cancelled less than 1 day before departure: no refund",
    ]);
  });

  it("words a 0-day tier as the last window, with no extra 'no refund' line", () => {
    expect(
      describeCancellationTiers(
        [
          { days: 3, percent: 50 },
          { days: 0, percent: 10 },
        ],
        "check-in",
      ),
    ).toEqual(["Cancelled at least 3 days before check-in: 50% refund", "Cancelled less than 3 days before check-in: 10% refund"]);
    expect(describeCancellationTiers([{ days: 0, percent: 100 }], "check-in")).toEqual([
      "Cancelled any time before check-in: 100% refund",
    ]);
  });

  it("says cancellations are not refunded when there are no tiers (0%)", () => {
    expect(describeCancellationTiers([], "departure")).toEqual(["Cancellations are not refunded."]);
    expect(describeCancellationTiers([{ days: 5, percent: 0 }], "departure")[0]).toBe(
      "Cancelled at least 5 days before departure: no refund",
    );
  });
});
