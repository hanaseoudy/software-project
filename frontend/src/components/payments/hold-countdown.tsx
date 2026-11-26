"use client";

// PAYC-2 (FLT-22, HTL-18, PAY-01): live countdown of a booking hold, used on the
// summary and pay pages of the flight and hotel checkout.
//
//   <HoldCountdown holdExpiresAt={booking.holdExpiresAt} bookingType="flight" />
//   <HoldCountdown holdExpiresAt={reservation.holdExpiresAt} bookingType="hotel" onExpire={() => setExpired(true)} />
//
// A Pending Payment booking is held for 10 minutes (FLT-22 / HTL-18). The time left
// is counted from the backend's `holdExpiresAt`. When it reaches zero the booking is
// expired (the backend releases the seats or rooms), so this shows an explanation and
// a link back to search instead of the timer. The backend stays the authority: it
// refuses a payment after the hold, whatever this timer shows.

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HoldBookingType = "flight" | "hotel";

export interface HoldCountdownProps {
  /** The booking's `holdExpiresAt` from the API (ISO string or Date). */
  holdExpiresAt: string | Date;
  /** Chooses the wording and the search page to go back to. */
  bookingType: HoldBookingType;
  /** Called once when the hold runs out, e.g. to hide the "Pay" or "Continue" button. */
  onExpire?: () => void;
  /** Where "Back to search" goes. Defaults to /flights or /hotels. */
  searchHref?: string;
  className?: string;
}

/** Below this many seconds the timer is highlighted. */
export const HOLD_WARNING_SECONDS = 120;

const SEARCH_PATHS: Record<HoldBookingType, string> = { flight: "/flights", hotel: "/hotels" };
const HELD_ITEMS: Record<HoldBookingType, string> = { flight: "seats", hotel: "rooms" };

/** Seconds left until `expiresAt` (never negative). */
export function secondsLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/** 600 -> "10:00", 65 -> "01:05", 3725 -> "1:02:05". */
export function formatTimeLeft(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// One shared clock for every countdown on the page. It ticks 4 times a second so the
// shown time is at most a quarter of a second behind (never shows more than is left).
const TICK_MS = 250;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
// The current time rounded UP to the tick: the value only changes once per tick, and the
// time left is never shown as more than it really is (at most a quarter second less).
const nowInTicks = () => Math.ceil(Date.now() / TICK_MS) * TICK_MS;
// On the server there is no live clock: nothing time-based is rendered (no hydration mismatch).
const serverNow = () => null;

export function HoldCountdown({ holdExpiresAt, bookingType, onExpire, searchHref, className }: HoldCountdownProps) {
  const now = useSyncExternalStore(subscribe, nowInTicks, serverNow);
  const expiresAt = new Date(holdExpiresAt).getTime();
  const valid = Number.isFinite(expiresAt);
  const left = now === null || !valid ? null : secondsLeft(expiresAt, now);
  const expired = left === 0;

  // Tell the page once, when the hold runs out.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  const reported = useRef(false);
  useEffect(() => {
    if (!expired) {
      reported.current = false; // a new hold (e.g. another booking) can expire again
    } else if (!reported.current) {
      reported.current = true;
      onExpireRef.current?.();
    }
  }, [expired]);

  if (!valid) return null;

  const items = HELD_ITEMS[bookingType];
  const box = "rounded-base border-2 border-border p-4 shadow-shadow";

  if (expired) {
    return (
      <div role="alert" className={cn(box, "flex flex-col gap-3 bg-background text-foreground", className)}>
        <p className="font-display text-lg font-heading">Your booking has expired</p>
        <p className="text-sm">
          The 10-minute hold ended before the payment was completed, so the {items} were released and this booking
          can no longer be paid. Please search again to make a new booking.
        </p>
        <Link href={searchHref ?? SEARCH_PATHS[bookingType]} className={cn(buttonVariants(), "self-start")}>
          {bookingType === "flight" ? "Back to flight search" : "Back to hotel search"}
        </Link>
      </div>
    );
  }

  const warning = left !== null && left <= HOLD_WARNING_SECONDS;
  return (
    <div
      className={cn(
        box,
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-foreground",
        warning ? "bg-mustard" : "bg-secondary-background",
        className,
      )}
    >
      <p className="text-sm">
        {warning
          ? `Less than 2 minutes left to pay for your ${items}. Complete the payment now, or the booking will expire.`
          : `Your ${items} are held for you. Complete the payment before the time runs out.`}
      </p>
      <p className="font-display text-2xl font-heading tabular-nums" role="timer" aria-live="off" aria-label="Time left">
        {left === null ? "--:--" : formatTimeLeft(left)}
      </p>
    </div>
  );
}
