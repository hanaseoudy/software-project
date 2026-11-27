import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ApiError, apiFetch } from "@/lib/api";

import { SUPPORTED_CURRENCIES } from "./currencies";
import { AirportPicker, CityPicker, CountryPicker, CurrencyPicker } from "./pickers";
import { clearReferenceDataCache } from "./reference-data-api";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, apiFetch: jest.fn() };
});
const mockFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const AIRPORTS = [
  { id: "a1", iataCode: "CAI", name: "Cairo International Airport", city: "Cairo", country: "Egypt", timezone: "Africa/Cairo" },
  { id: "a2", iataCode: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom", timezone: "Europe/London" },
];
const COUNTRIES = [
  { id: "c1", code: "EG", name: "Egypt", currency: "EGP" },
  { id: "c2", code: "GB", name: "United Kingdom", currency: "GBP" },
];
const CITIES = [{ id: "t1", cityId: "cairo", name: "Cairo", countryCode: "EG" }];
const paged = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10, totalPages: 1 });

beforeEach(() => {
  clearReferenceDataCache();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (path: string) => {
    if (path === "/airports") return AIRPORTS;
    if (path.startsWith("/countries")) return paged(COUNTRIES);
    if (path.startsWith("/cities")) return paged(CITIES);
    throw new Error(`unexpected ${path}`);
  });
});

describe("AirportPicker (GEN-12)", () => {
  it("shows a loading state, then the airports", async () => {
    render(<AirportPicker label="From" value="" onChange={() => {}} />);
    const select = screen.getByLabelText("From");
    expect(select).toBeDisabled();
    expect(screen.getByRole("option", { name: "Loading…" })).toBeInTheDocument();

    await screen.findByRole("option", { name: /CAI · Cairo International Airport \(Cairo, Egypt\)/ });
    expect(select).toBeEnabled();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("gives the IATA code by default, and the whole airport", async () => {
    const onChange = jest.fn();
    render(<AirportPicker label="From" value="" onChange={onChange} />);
    await screen.findByRole("option", { name: /LHR/ });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "LHR" } });
    expect(onChange).toHaveBeenCalledWith("LHR", AIRPORTS[1]);
  });

  it("can give the database id instead", async () => {
    const onChange = jest.fn();
    render(<AirportPicker label="From" valueKey="id" value="" onChange={onChange} />);
    await screen.findByRole("option", { name: /CAI/ });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "a1" } });
    expect(onChange).toHaveBeenCalledWith("a1", AIRPORTS[0]);
  });

  it("calls onChange with an empty value and no record when cleared", async () => {
    const onChange = jest.fn();
    render(<AirportPicker label="From" value="CAI" onChange={onChange} />);
    await screen.findByRole("option", { name: /CAI/ });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("", undefined);
  });

  it("shows the chosen value", async () => {
    render(<AirportPicker label="From" value="LHR" onChange={() => {}} />);
    await screen.findByRole("option", { name: /LHR/ });
    expect(screen.getByLabelText("From")).toHaveValue("LHR");
  });

  it("shows the backend field error and marks the field invalid", async () => {
    render(<AirportPicker label="From" value="" onChange={() => {}} error={["Departure airport must be a 3-letter IATA code"]} />);
    await screen.findByRole("option", { name: /CAI/ });
    const select = screen.getByLabelText("From");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("Departure airport must be a 3-letter IATA code");
  });

  it("marks a required field", async () => {
    render(<AirportPicker label="From" required value="" onChange={() => {}} />);
    await screen.findByRole("option", { name: /CAI/ });
    expect(screen.getByLabelText(/From/)).toBeRequired();
  });

  it("shows the error with Try again when loading fails, and loads again", async () => {
    mockFetch.mockRejectedValueOnce(new ApiError(0, "We couldn't reach the server."));
    render(<AirportPicker label="From" value="" onChange={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach the server.");
    expect(screen.getByLabelText("From")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("option", { name: /CAI/ });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeEnabled();
  });

  it("uses a generic message for an error that is not an ApiError", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AirportPicker label="From" value="" onChange={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load this list.");
  });
});

describe("CountryPicker (GEN-12)", () => {
  it("lists the countries and gives the code by default", async () => {
    const onChange = jest.fn();
    render(<CountryPicker label="Country" value="" onChange={onChange} />);
    await screen.findByRole("option", { name: "Egypt" });

    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "GB" } });
    expect(onChange).toHaveBeenCalledWith("GB", COUNTRIES[1]);
  });

  it("can give the database id (hotels)", async () => {
    const onChange = jest.fn();
    render(<CountryPicker label="Country" valueKey="id" value="" onChange={onChange} />);
    await screen.findByRole("option", { name: "Egypt" });

    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "c1" } });
    expect(onChange).toHaveBeenCalledWith("c1", COUNTRIES[0]);
  });
});

describe("CityPicker (GEN-12)", () => {
  it("lists the cities and gives the city id by default", async () => {
    const onChange = jest.fn();
    render(<CityPicker label="City" value="" onChange={onChange} />);
    await screen.findByRole("option", { name: "Cairo" });

    fireEvent.change(screen.getByLabelText("City"), { target: { value: "cairo" } });
    expect(onChange).toHaveBeenCalledWith("cairo", CITIES[0]);
    expect(mockFetch).toHaveBeenCalledWith("/cities?page=1");
  });

  it("asks only for the cities of the chosen country, and reloads when it changes", async () => {
    const { rerender } = render(<CityPicker label="City" country="EG" value="" onChange={() => {}} />);
    await screen.findByRole("option", { name: "Cairo" });
    expect(mockFetch).toHaveBeenCalledWith("/cities?country=EG&page=1");

    mockFetch.mockImplementation(async () => paged([{ id: "t2", cityId: "london", name: "London", countryCode: "GB" }]));
    rerender(<CityPicker label="City" country="GB" value="" onChange={() => {}} />);
    await screen.findByRole("option", { name: "London" });
    await waitFor(() => expect(screen.queryByRole("option", { name: "Cairo" })).not.toBeInTheDocument());
  });

  it("can give the database id (hotels)", async () => {
    const onChange = jest.fn();
    render(<CityPicker label="City" valueKey="id" value="" onChange={onChange} />);
    await screen.findByRole("option", { name: "Cairo" });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "t1" } });
    expect(onChange).toHaveBeenCalledWith("t1", CITIES[0]);
  });

  it("says so when a country has no cities", async () => {
    mockFetch.mockImplementation(async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }));
    render(<CityPicker label="City" country="JP" value="" onChange={() => {}} />);
    expect(await screen.findByText("Nothing to choose from yet.")).toBeInTheDocument();
  });
});

describe("CurrencyPicker (GEN-12)", () => {
  it("lists the supported currencies without any request", () => {
    render(<CurrencyPicker label="Currency" value="" onChange={() => {}} />);
    expect(screen.getAllByRole("option")).toHaveLength(SUPPORTED_CURRENCIES.length + 1);
    expect(screen.getByRole("option", { name: "USD · US Dollar" })).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("gives the currency code and the record", () => {
    const onChange = jest.fn();
    render(<CurrencyPicker label="Currency" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "EUR" } });
    expect(onChange).toHaveBeenCalledWith("EUR", { code: "EUR", name: "Euro" });
  });
});
