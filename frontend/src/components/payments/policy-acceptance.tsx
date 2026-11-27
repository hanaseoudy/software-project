"use client";

// PAYC-3 (PAY-02): the provider policies + required acceptance checkbox, used on the
// flight and hotel summary pages (/checkout/flight/[id]/summary, /checkout/hotel/[id]/summary).
//
//   <PolicyAcceptance bookingType="flight" bookingId={id} />
//
// 1. GET /api/bookings/:type/:id/policies shows the policies
//    (airline: cancellation + baggage; hotel: cancellation + check-in/check-out times).
// 2. "Continue to payment" stays disabled until the checkbox is ticked.
// 3. POST /api/bookings/:type/:id/accept-policies stores the acceptance with a timestamp
//    (the backend blocks payment until then), then goes to the pay page.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { isApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";

import {
  acceptPolicies,
  describeCancellationTiers,
  getPolicies,
  type BookingPolicies,
  type FlightLegPolicies,
  type FlightPolicies,
  type HotelPolicies,
  type PolicyBookingType,
} from "./policies-api";

export interface PolicyAcceptanceProps {
  bookingType: PolicyBookingType;
  /** The Pending Payment flight booking or hotel reservation id. */
  bookingId: string;
  /** Where "Continue to payment" goes after accepting. Defaults to /checkout/<type>/<id>/pay. */
  continueHref?: string;
  /** Called after the backend stored the acceptance (or it was already accepted). */
  onAccepted?: (acceptedAt: string) => void;
}

export function payPathFor(bookingType: PolicyBookingType, bookingId: string): string {
  return `/checkout/${bookingType}/${encodeURIComponent(bookingId)}/pay`;
}

function messageOf(error: unknown, fallback: string): string {
  return isApiError(error) || error instanceof Error ? error.message || fallback : fallback;
}

function formatAcceptedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: BookingPolicies };

export function PolicyAcceptance({ bookingType, bookingId, continueHref, onAccepted }: PolicyAcceptanceProps) {
  const router = useRouter();
  const checkboxId = useId();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPolicies(bookingType, bookingId).then(
      (data) => {
        if (!active) return;
        setLoad({ state: "ready", data });
        setChecked(data.accepted);
      },
      (error) => active && setLoad({ state: "error", message: messageOf(error, "We couldn't load the policies.") }),
    );
    return () => {
      active = false;
    };
  }, [bookingType, bookingId, reloadKey]);

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setReloadKey((k) => k + 1);
  }, []);

  if (load.state === "loading") {
    return (
      <PoliciesCard bookingType={bookingType}>
        <p role="status" className="text-sm">
          Loading the provider&apos;s policies…
        </p>
      </PoliciesCard>
    );
  }

  if (load.state === "error") {
    return (
      <PoliciesCard bookingType={bookingType}>
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm font-heading text-main">
            {load.message}
          </p>
          <Button type="button" variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      </PoliciesCard>
    );
  }

  const { data } = load;
  const alreadyAccepted = data.accepted && !!data.acceptedAt;

  async function handleContinue() {
    setSaveError(null);
    const target = continueHref ?? payPathFor(bookingType, bookingId);
    if (alreadyAccepted) {
      onAccepted?.(data.acceptedAt!);
      return router.push(target);
    }
    setSaving(true);
    try {
      const result = await acceptPolicies(bookingType, bookingId);
      onAccepted?.(result.acceptedAt);
      router.push(target);
    } catch (error) {
      setSaveError(messageOf(error, "We couldn't save your acceptance. Please try again."));
      setSaving(false);
    }
  }

  return (
    <PoliciesCard
      bookingType={bookingType}
      footer={
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-start gap-3">
            <input
              id={checkboxId}
              type="checkbox"
              required
              aria-required="true"
              checked={checked}
              disabled={alreadyAccepted || saving}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-main"
            />
            <label htmlFor={checkboxId} className="text-sm font-heading">
              I have read and accept these policies.
            </label>
          </div>
          {alreadyAccepted && (
            <p className="text-sm">You accepted these policies on {formatAcceptedAt(data.acceptedAt!)}.</p>
          )}
          {saveError && (
            <p role="alert" className="text-sm font-heading text-main">
              {saveError}
            </p>
          )}
          <Button type="button" className="self-start" disabled={!checked || saving} onClick={handleContinue}>
            {saving ? "Saving…" : "Continue to payment"}
          </Button>
          {!checked && <p className="text-sm">Tick the box to accept the policies before you pay.</p>}
        </div>
      }
    >
      {data.policies.bookingType === "flight" ? (
        <FlightPoliciesView policies={data.policies} />
      ) : (
        <HotelPoliciesView policies={data.policies} />
      )}
    </PoliciesCard>
  );
}

function PoliciesCard({
  bookingType,
  footer,
  children,
}: {
  bookingType: PolicyBookingType;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">
          {bookingType === "flight" ? "Airline policies" : "Hotel policies"}
        </CardTitle>
        <CardDescription>Please read these policies. You must accept them before you can pay.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

function PolicySection({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-base">{title}</h4>
      <ul className="list-disc pl-5 text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function baggageLines({ baggagePolicy: bag }: FlightLegPolicies): string[] {
  const kg = bag.maxBagWeightKg ? `up to ${bag.maxBagWeightKg} kg each` : null;
  const free =
    bag.freeBags > 0
      ? `${bag.freeBags} free checked ${bag.freeBags === 1 ? "bag" : "bags"} per passenger${kg ? ` (${kg})` : ""}`
      : "No free checked bags";
  const extra =
    bag.maxExtraBagsPerPassenger > 0
      ? `Extra bags: ${formatMoney(bag.extraBagPrice)} each, at most ${bag.maxExtraBagsPerPassenger} per passenger${kg ? ` (${kg})` : ""}`
      : "Extra bags are not allowed";
  return [free, extra];
}

function FlightPoliciesView({ policies }: { policies: FlightPolicies }) {
  return (
    <>
      {policies.flights.map((leg) => {
        const rules = leg.cancellationPolicy?.rules ?? [];
        return (
          <section key={`${leg.direction}-${leg.flightNumber}`} className="flex flex-col gap-3" aria-label={`${leg.direction} flight policies`}>
            <h3 className="text-lg">
              {leg.direction === "return" ? "Return flight" : "Outbound flight"} {leg.flightNumber} · {leg.airline.name}
            </h3>
            <PolicySection
              title="Cancellation policy"
              lines={describeCancellationTiers(
                rules.map((r) => ({ days: r.daysBeforeDeparture, percent: r.refundPercent })),
                "departure",
              )}
            />
            <PolicySection title="Baggage policy" lines={baggageLines(leg)} />
          </section>
        );
      })}
    </>
  );
}

function HotelPoliciesView({ policies }: { policies: HotelPolicies }) {
  const tiers = policies.cancellationPolicy?.tiers ?? [];
  return (
    <section className="flex flex-col gap-3" aria-label="hotel policies">
      <h3 className="text-lg">{policies.hotel.name}</h3>
      <PolicySection
        title="Check-in and check-out"
        lines={[
          `Check-in from ${policies.checkInTime || "the hotel's standard time"}`,
          `Check-out by ${policies.checkOutTime || "the hotel's standard time"}`,
        ]}
      />
      <PolicySection
        title="Cancellation policy"
        lines={describeCancellationTiers(
          tiers.map((t) => ({ days: t.daysBeforeCheckIn, percent: t.refundPercentage })),
          "check-in",
        )}
      />
    </section>
  );
}
