import { render, screen } from "@testing-library/react";

import DesignSystemPage from "./page";

// The reference-data demo loads its lists from the backend; no request is made in these tests.
jest.mock("@/components/reference-data", () => ({
  AirportPicker: ({ label }: { label: string }) => <div>{label}</div>,
  CountryPicker: ({ label }: { label: string }) => <div>{label}</div>,
  CityPicker: ({ label }: { label: string }) => <div>{label}</div>,
  CurrencyPicker: ({ label }: { label: string }) => <div>{label}</div>,
}));

describe("/design-system (GEN-17)", () => {
  it("shows the whole agreed palette", () => {
    render(<DesignSystemPage />);

    for (const hex of ["#F5EFDC", "#63383C", "#A8B79A", "#697D50", "#C48772", "#D9B65D", "#352C28"]) {
      expect(screen.getByText(hex)).toBeInTheDocument();
    }
  });

  it("shows the button variants and formatter examples", () => {
    render(<DesignSystemPage />);

    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secondary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
    expect(screen.getByText("USD 640.00")).toBeInTheDocument();
    expect(screen.getByText("Sat 5 Dec 2026, 10:00")).toBeInTheDocument();
  });

  it("labels the form input", () => {
    render(<DesignSystemPage />);

    expect(screen.getByLabelText("City")).toBeInTheDocument();
  });

  it("previews the reference-data pickers (GEN-12)", () => {
    render(<DesignSystemPage />);

    expect(screen.getByRole("heading", { name: "Reference-data pickers (GEN-12)" })).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
    expect(screen.getByText("Currency")).toBeInTheDocument();
  });

  it("previews the loading, success and error feedback (GEN-16)", () => {
    render(<DesignSystemPage />);

    expect(screen.getByRole("heading", { name: "Loading, success and error feedback (GEN-16)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show success toast" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hotel not found" })).toBeInTheDocument();
  });
});
