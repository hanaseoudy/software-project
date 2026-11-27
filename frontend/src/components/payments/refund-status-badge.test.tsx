import { render, screen } from "@testing-library/react";

import { RefundStatusBadge } from "./refund-status-badge";

describe("<RefundStatusBadge /> (PAYC-4, PAY-03)", () => {
  it.each([
    ["pending", "Refund pending", "bg-mustard"],
    ["refunded", "Refunded", "bg-secondary-background"],
    ["failed", "Refund failed", "bg-main"],
  ] as const)("shows %s with its label and the amount", (status, label, background) => {
    const { container } = render(<RefundStatusBadge status={status} amount={60.25} currency="USD" />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge).toHaveTextContent(`${label}·USD 60.25`);
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge).toHaveClass(background);
  });

  it("formats the amount in the platform currency by default (PAY-04)", () => {
    render(<RefundStatusBadge status="refunded" amount={1250.5} />);

    expect(screen.getByText(/USD 1,250.50/)).toBeInTheDocument();
  });

  it("gives each status a different colour", () => {
    const colours = (["pending", "refunded", "failed"] as const).map((status) => {
      const { container } = render(<RefundStatusBadge status={status} amount={1} />);
      return (container.firstElementChild as HTMLElement).className.match(/\bbg-[a-z-]+/g)?.pop();
    });

    expect(new Set(colours).size).toBe(3);
  });
});
