import { formatAirportDate, formatAirportDateTime, formatAirportTime } from "./airport-time";

// 5 December 2026, 08:00 UTC
const UTC_TIME = "2026-12-05T08:00:00.000Z";

describe("airport local time (GEN-06)", () => {
  it("shows the same instant in each airport's own time zone", () => {
    expect(formatAirportTime(UTC_TIME, "Africa/Cairo")).toBe("10:00");
    expect(formatAirportTime(UTC_TIME, "Europe/London")).toBe("08:00");
    expect(formatAirportTime(UTC_TIME, "Asia/Dubai")).toBe("12:00");
    expect(formatAirportTime(UTC_TIME, "America/New_York")).toBe("03:00");
  });

  it("changes the date when the local day is different", () => {
    expect(formatAirportDate("2026-12-05T23:30:00.000Z", "Asia/Tokyo")).toBe("Sun 6 Dec 2026");
    expect(formatAirportDate("2026-12-05T23:30:00.000Z", "Europe/London")).toBe("Sat 5 Dec 2026");
  });

  it("formats date and time together", () => {
    expect(formatAirportDateTime(UTC_TIME, "Africa/Cairo")).toBe("Sat 5 Dec 2026, 10:00");
  });

  it("can show the zone", () => {
    expect(formatAirportTime(UTC_TIME, "Asia/Dubai", { showZone: true })).toBe("12:00 GMT+4");
    expect(formatAirportTime(UTC_TIME, "Africa/Cairo", { showZone: true })).toBe("10:00 GMT+2");
    expect(formatAirportTime(UTC_TIME, "Europe/London", { showZone: true })).toBe("08:00 GMT");
  });

  it("accepts Date objects and timestamps", () => {
    const date = new Date(UTC_TIME);
    expect(formatAirportTime(date, "Africa/Cairo")).toBe("10:00");
    expect(formatAirportTime(date.getTime(), "Africa/Cairo")).toBe("10:00");
  });

  it("does not depend on the browser's time zone", () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(formatAirportTime(UTC_TIME, "Africa/Cairo")).toBe("10:00");
    } finally {
      process.env.TZ = original;
    }
  });

  it("refuses invalid input instead of showing a wrong time", () => {
    expect(() => formatAirportTime("not a date", "Africa/Cairo")).toThrow(RangeError);
    expect(() => formatAirportTime(UTC_TIME, "")).toThrow(/time zone is required/);
    expect(() => formatAirportTime(UTC_TIME, "Mars/Olympus")).toThrow(RangeError);
  });
});
