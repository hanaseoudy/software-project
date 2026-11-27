import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ApiError } from "@/lib/api";

import { PolicyAcceptance } from "./policy-acceptance";

const apiFetch = jest.fn();
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), apiFetch: (...args: unknown[]) => apiFetch(...args) }));
const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const flight = {
  bookingId: "b1",
  accepted: false,
  acceptedAt: null,
  policies: {
    bookingType: "flight",
    cabinClass: "ECONOMY",
    flights: [
      {
        direction: "outbound",
        flightNumber: "MS777",
        airline: { id: "a1", name: "EgyptAir", code: "MS" },
        cancellationPolicy: { rules: [{ daysBeforeDeparture: 7, refundPercent: 80 }, { daysBeforeDeparture: 1, refundPercent: 20 }] },
        baggagePolicy: { freeBags: 1, maxBagWeightKg: 23, extraBagPrice: 50, maxExtraBagsPerPassenger: 2 },
      },
      {
        direction: "return",
        flightNumber: "MS778",
        airline: { id: "a1", name: "EgyptAir", code: "MS" },
        cancellationPolicy: { rules: [] },
        baggagePolicy: { freeBags: 0, maxBagWeightKg: null, extraBagPrice: 0, maxExtraBagsPerPassenger: 0 },
      },
    ],
  },
};

const hotel = {
  bookingId: "h1",
  accepted: false,
  acceptedAt: null,
  policies: {
    bookingType: "hotel",
    hotel: { id: "x", name: "Nile Palace Hotel" },
    checkInTime: "15:00",
    checkOutTime: "10:30",
    cancellationPolicy: { tiers: [{ daysBeforeCheckIn: 2, refundPercentage: 100 }] },
  },
};

function backend(policies: unknown, accept: unknown = { bookingId: "b1", accepted: true, acceptedAt: "2026-12-01T10:00:00.000Z" }) {
  apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.endsWith("/policies")) {
      if (policies instanceof Error) throw policies;
      return policies;
    }
    if (path.endsWith("/accept-policies") && init?.method === "POST") {
      if (accept instanceof Error) throw accept;
      return accept;
    }
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => jest.clearAllMocks());

describe("<PolicyAcceptance /> (PAYC-3, PAY-02)", () => {
  it("shows the airline's cancellation and baggage policies for every flight", async () => {
    backend(flight);
    render(<PolicyAcceptance bookingType="flight" bookingId="b1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(await screen.findByText("Outbound flight MS777 · EgyptAir")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/bookings/flight/b1/policies");
    expect(screen.getByText("Cancelled at least 7 days before departure: 80% refund")).toBeInTheDocument();
    expect(screen.getByText("Cancelled less than 1 day before departure: no refund")).toBeInTheDocument();
    expect(screen.getByText("1 free checked bag per passenger (up to 23 kg each)")).toBeInTheDocument();
    expect(screen.getByText("Extra bags: USD 50.00 each, at most 2 per passenger (up to 23 kg each)")).toBeInTheDocument();
    // Return leg with no tiers and no bags
    expect(screen.getByText("Return flight MS778 · EgyptAir")).toBeInTheDocument();
    expect(screen.getByText("Cancellations are not refunded.")).toBeInTheDocument();
    expect(screen.getByText("No free checked bags")).toBeInTheDocument();
    expect(screen.getByText("Extra bags are not allowed")).toBeInTheDocument();
  });

  it("shows the hotel's cancellation policy and check-in/check-out times", async () => {
    backend(hotel);
    render(<PolicyAcceptance bookingType="hotel" bookingId="h1" />);

    expect(await screen.findByText("Nile Palace Hotel")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/bookings/hotel/h1/policies");
    expect(screen.getByText("Check-in from 15:00")).toBeInTheDocument();
    expect(screen.getByText("Check-out by 10:30")).toBeInTheDocument();
    expect(screen.getByText("Cancelled at least 2 days before check-in: 100% refund")).toBeInTheDocument();
  });

  it("blocks 'Continue to payment' until the required checkbox is ticked", async () => {
    backend(flight);
    render(<PolicyAcceptance bookingType="flight" bookingId="b1" />);

    const box = await screen.findByRole("checkbox", { name: "I have read and accept these policies." });
    const next = screen.getByRole("button", { name: "Continue to payment" });
    expect(box).toBeRequired();
    expect(box).not.toBeChecked();
    expect(next).toBeDisabled();

    fireEvent.click(box);
    expect(next).toBeEnabled();
    fireEvent.click(box);
    expect(next).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("accept-policies"), expect.anything());
  });

  it("calls accept-policies, then goes to the pay page", async () => {
    backend(flight);
    const onAccepted = jest.fn();
    render(<PolicyAcceptance bookingType="flight" bookingId="b1" onAccepted={onAccepted} />);

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/flight/b1/pay"));
    expect(apiFetch).toHaveBeenCalledWith("/bookings/flight/b1/accept-policies", { method: "POST" });
    expect(onAccepted).toHaveBeenCalledWith("2026-12-01T10:00:00.000Z");
  });

  it("goes to a custom page when continueHref is given", async () => {
    backend(hotel, { bookingId: "h1", accepted: true, acceptedAt: "2026-12-01T10:00:00.000Z" });
    render(<PolicyAcceptance bookingType="hotel" bookingId="h1" continueHref="/somewhere" />);

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/somewhere"));
  });

  it("shows the backend's error and stays on the page when accepting fails", async () => {
    backend(flight, new ApiError(400, "The hold on this booking has expired or is missing"));
    render(<PolicyAcceptance bookingType="flight" bookingId="b1" />);

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The hold on this booking has expired or is missing");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  });

  it("shows an already accepted booking as ticked, with the stored time, and continues without accepting again", async () => {
    backend({ ...flight, accepted: true, acceptedAt: "2026-12-01T10:00:00.000Z" });
    render(<PolicyAcceptance bookingType="flight" bookingId="b1" />);

    const box = await screen.findByRole("checkbox");
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(screen.getByText(/You accepted these policies on/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/flight/b1/pay"));
    expect(apiFetch).toHaveBeenCalledTimes(1); // only the GET
  });

  it("shows an error with a retry when the policies cannot be loaded", async () => {
    let calls = 0;
    apiFetch.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new ApiError(404, "Booking not found");
      return flight;
    });
    render(<PolicyAcceptance bookingType="flight" bookingId="b1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Booking not found");
    expect(screen.queryByRole("button", { name: "Continue to payment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Outbound flight MS777 · EgyptAir")).toBeInTheDocument();
  });
});
