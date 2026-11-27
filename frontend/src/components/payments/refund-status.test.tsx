import { render, screen } from "@testing-library/react";

import { ApiError } from "@/lib/api";

import { RefundStatus } from "./refund-status";

const serverFetch = jest.fn();
jest.mock("@/lib/api/server", () => ({ serverFetch: (...args: unknown[]) => serverFetch(...args) }));

const refund = {
  id: "r1",
  paymentId: "p1",
  bookingType: "flight",
  bookingId: "b1",
  amount: 159.99,
  currency: "USD",
  status: "pending",
};

/** Renders the async Server Component the way the page does. */
async function renderServer(props: { refundId: string }) {
  render(<>{await RefundStatus(props)}</>);
}

beforeEach(() => jest.clearAllMocks());

describe("<RefundStatus /> (PAYC-4, PAY-03)", () => {
  it("loads the refund with GET /api/refunds/:id and shows its badge", async () => {
    serverFetch.mockResolvedValue({ ...refund, status: "refunded" });

    await renderServer({ refundId: "r1" });

    expect(serverFetch).toHaveBeenCalledWith("/refunds/r1");
    expect(screen.getByText(/Refunded/)).toHaveTextContent("Refunded·USD 159.99");
  });

  it.each([
    ["pending", "Refund pending"],
    ["failed", "Refund failed"],
  ])("shows a %s refund", async (status, label) => {
    serverFetch.mockResolvedValue({ ...refund, status });

    await renderServer({ refundId: "r1" });

    expect(screen.getByText(new RegExp(label))).toHaveTextContent(`${label}·USD 159.99`);
  });

  it("shows nothing when the refund does not exist (404)", async () => {
    serverFetch.mockRejectedValue(new ApiError(404, "Refund not found"));

    const { container } = render(<>{await RefundStatus({ refundId: "nope" })}</>);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unavailable note on 401 instead of re-throwing (the page handles the session)", async () => {
    serverFetch.mockRejectedValue(new ApiError(401, "Not authenticated"));

    await renderServer({ refundId: "r1" });

    expect(screen.getByText("Refund status is unavailable right now.")).toBeInTheDocument();
  });

  it("shows a short note instead of breaking the page on other errors", async () => {
    serverFetch.mockRejectedValue(new ApiError(500, "Something went wrong"));

    await renderServer({ refundId: "r1" });

    expect(screen.getByText("Refund status is unavailable right now.")).toBeInTheDocument();
  });
});
