import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { formatTimeLeft, HoldCountdown, secondsLeft } from "./hold-countdown";

const START = new Date("2026-12-01T10:00:00.000Z").getTime();
const inMinutes = (m: number) => new Date(START + m * 60_000).toISOString();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});
afterEach(() => jest.useRealTimers());

const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));

describe("formatTimeLeft / secondsLeft (PAYC-2)", () => {
  it("formats the time left", () => {
    expect(formatTimeLeft(600)).toBe("10:00");
    expect(formatTimeLeft(65)).toBe("01:05");
    expect(formatTimeLeft(0)).toBe("00:00");
    expect(formatTimeLeft(3725)).toBe("1:02:05");
  });

  it("never goes below zero", () => {
    expect(secondsLeft(START, START + 5000)).toBe(0);
    expect(secondsLeft(START + 1500, START)).toBe(2);
  });
});

describe("<HoldCountdown /> (PAYC-2: FLT-22, HTL-18, PAY-01)", () => {
  it("shows the 10-minute hold counting down from holdExpiresAt", () => {
    render(<HoldCountdown holdExpiresAt={inMinutes(10)} bookingType="flight" />);

    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
    expect(screen.getByText(/Your seats are held for you/)).toBeInTheDocument();
    tick(1000);
    expect(screen.getByRole("timer")).toHaveTextContent("09:59");
    tick(4 * 60_000);
    expect(screen.getByRole("timer")).toHaveTextContent("05:59");
  });

  it("accepts a Date and words the hotel hold as rooms", () => {
    render(<HoldCountdown holdExpiresAt={new Date(START + 300_000)} bookingType="hotel" />);

    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
    expect(screen.getByText(/Your rooms are held for you/)).toBeInTheDocument();
  });

  it("highlights the last 2 minutes", () => {
    const { container } = render(<HoldCountdown holdExpiresAt={inMinutes(3)} bookingType="flight" />);
    const box = () => container.firstElementChild as HTMLElement;

    expect(box()).toHaveClass("bg-secondary-background");
    tick(60_000);
    expect(screen.getByRole("timer")).toHaveTextContent("02:00");
    expect(box()).toHaveClass("bg-mustard");
    expect(screen.getByText(/Less than 2 minutes left to pay for your seats/)).toBeInTheDocument();
  });

  it("on expiry explains the booking expired and links back to flight search, calling onExpire once", () => {
    const onExpire = jest.fn();
    render(<HoldCountdown holdExpiresAt={inMinutes(1)} bookingType="flight" onExpire={onExpire} />);
    expect(onExpire).not.toHaveBeenCalled();

    tick(60_000);

    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Your booking has expired");
    expect(screen.getByRole("alert")).toHaveTextContent("the seats were released");
    expect(screen.getByRole("link", { name: "Back to flight search" })).toHaveAttribute("href", "/flights");
    tick(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("is already expired when opened after the hold ended (hotel -> hotel search)", () => {
    const onExpire = jest.fn();
    render(<HoldCountdown holdExpiresAt={inMinutes(-2)} bookingType="hotel" onExpire={onExpire} />);

    expect(screen.getByRole("alert")).toHaveTextContent("the rooms were released");
    expect(screen.getByRole("link", { name: "Back to hotel search" })).toHaveAttribute("href", "/hotels");
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("calls onExpire again for a new hold shown in the same place", () => {
    const onExpire = jest.fn();
    const { rerender } = render(<HoldCountdown holdExpiresAt={inMinutes(-1)} bookingType="flight" onExpire={onExpire} />);
    expect(onExpire).toHaveBeenCalledTimes(1);

    rerender(<HoldCountdown holdExpiresAt={new Date(START + 1_000)} bookingType="flight" onExpire={onExpire} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:01");
    tick(1000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it("uses a custom search link when given", () => {
    render(<HoldCountdown holdExpiresAt={inMinutes(-1)} bookingType="flight" searchHref="/flights?from=CAI" />);

    expect(screen.getByRole("link", { name: "Back to flight search" })).toHaveAttribute("href", "/flights?from=CAI");
  });

  it("renders nothing for a missing or invalid holdExpiresAt", () => {
    const { container } = render(<HoldCountdown holdExpiresAt="not a date" bookingType="flight" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders no clock on the server, so the page hydrates without a mismatch", () => {
    const html = renderToString(<HoldCountdown holdExpiresAt={inMinutes(10)} bookingType="flight" />);

    expect(html).toContain("--:--");
    expect(html).not.toContain("10:00");
  });
});

describe("<HoldCountdown /> timing", () => {
  it("never shows more time than is left (hold created a moment ago)", () => {
    // 600 s hold, page opened 0.2 s later -> 599.8 s left -> shows 10:00, not 10:01.
    jest.setSystemTime(START + 200);
    render(<HoldCountdown holdExpiresAt={new Date(START + 600_000)} bookingType="flight" />);

    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
    act(() => jest.advanceTimersByTime(800));
    expect(screen.getByRole("timer")).toHaveTextContent("09:59");
  });

  it("never shows more time than is left, at any moment inside a tick", () => {
    for (const offset of [1, 100, 249, 250, 251, 999]) {
      jest.setSystemTime(START + offset);
      const { unmount } = render(<HoldCountdown holdExpiresAt={new Date(START + 600_000)} bookingType="flight" />);
      // Real time left is 600 s minus the offset: shown as 10:00 or 09:59, never 10:01.
      expect(["10:00", "09:59"]).toContain(screen.getByRole("timer").textContent);
      unmount();
    }
  });

  it("expires at the hold time, not earlier", () => {
    const onExpire = jest.fn();
    render(<HoldCountdown holdExpiresAt={new Date(START + 1_000)} bookingType="flight" onExpire={onExpire} />);

    act(() => jest.advanceTimersByTime(750));
    expect(screen.getByRole("timer")).toHaveTextContent("00:01");
    expect(onExpire).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(250));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
