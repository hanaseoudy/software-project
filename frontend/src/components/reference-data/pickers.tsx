"use client";

// GEN-12 reference-data pickers. Each one is a controlled field:
//
//   <AirportPicker label="From" value={from} onChange={setFrom} error={errors.departureAirport} />
//   <CountryPicker label="Country" value={country} onChange={setCountry} />
//   <CityPicker label="City" country={country} value={city} onChange={setCity} />   // cities of that country
//   <CurrencyPicker label="Currency" value={currency} onChange={setCurrency} />
//
// `value` is "" when nothing is chosen. `onChange(value, item)` also gives the whole
// chosen record (undefined when cleared), e.g. to fill a country's currency.
// Which field is the value is a prop, because the backend uses both forms:
//   airports  valueKey="iataCode" (flight search, default) or "id" (creating a flight)
//   countries valueKey="code" (default) or "id" (hotels)
//   cities    valueKey="cityId" (itineraries, default) or "id" (hotels)
// Other props: label, error (backend message), required, disabled, placeholder, name, id.

import { useMemo } from "react";

import {
  clearReferenceDataCache,
  getAirports,
  getCities,
  getCountries,
  type Airport,
  type City,
  type Country,
} from "./reference-data-api";
import { SUPPORTED_CURRENCIES, type CurrencyOption } from "./currencies";
import { ReferenceSelect, type ReferenceSelectProps } from "./reference-select";
import { useReferenceList } from "./use-reference-list";

type SharedProps = Omit<ReferenceSelectProps, "options" | "isLoading" | "loadError" | "onRetry" | "onChange" | "value"> & {
  value: string;
};

function pick<T>(items: T[], getValue: (item: T) => string, value: string): T | undefined {
  return value ? items.find((item) => getValue(item) === value) : undefined;
}

export type AirportPickerProps = SharedProps & {
  valueKey?: "iataCode" | "id";
  onChange: (value: string, airport?: Airport) => void;
};

export function AirportPicker({ valueKey = "iataCode", onChange, ...props }: AirportPickerProps) {
  const list = useReferenceList<Airport>("airports", getAirports, clearReferenceDataCache);
  const options = useMemo(
    () => list.items.map((a) => ({ value: a[valueKey], label: `${a.iataCode} · ${a.name} (${a.city}, ${a.country})` })),
    [list.items, valueKey],
  );
  return (
    <ReferenceSelect
      placeholder="Select an airport"
      {...props}
      options={options}
      isLoading={list.isLoading}
      loadError={list.error}
      onRetry={list.reload}
      onChange={(value) => onChange(value, pick(list.items, (a) => a[valueKey], value))}
    />
  );
}

export type CountryPickerProps = SharedProps & {
  valueKey?: "code" | "id";
  onChange: (value: string, country?: Country) => void;
};

export function CountryPicker({ valueKey = "code", onChange, ...props }: CountryPickerProps) {
  const list = useReferenceList<Country>("countries", getCountries, clearReferenceDataCache);
  const options = useMemo(() => list.items.map((c) => ({ value: c[valueKey], label: c.name })), [list.items, valueKey]);
  return (
    <ReferenceSelect
      placeholder="Select a country"
      {...props}
      options={options}
      isLoading={list.isLoading}
      loadError={list.error}
      onRetry={list.reload}
      onChange={(value) => onChange(value, pick(list.items, (c) => c[valueKey], value))}
    />
  );
}

export type CityPickerProps = SharedProps & {
  /** Only cities of this country: a 2-letter code ("EG") or a country id. Without it, all cities. */
  country?: string;
  valueKey?: "cityId" | "id";
  onChange: (value: string, city?: City) => void;
};

export function CityPicker({ country, valueKey = "cityId", onChange, ...props }: CityPickerProps) {
  const list = useReferenceList<City>(`cities:${country ?? ""}`, () => getCities(country), clearReferenceDataCache);
  const options = useMemo(() => list.items.map((c) => ({ value: c[valueKey], label: c.name })), [list.items, valueKey]);
  return (
    <ReferenceSelect
      placeholder="Select a city"
      {...props}
      options={options}
      isLoading={list.isLoading}
      loadError={list.error}
      onRetry={list.reload}
      onChange={(value) => onChange(value, pick(list.items, (c) => c[valueKey], value))}
    />
  );
}

export type CurrencyPickerProps = SharedProps & {
  onChange: (value: string, currency?: CurrencyOption) => void;
};

/** No request: the list is the frontend copy of the backend's SupportedCurrency (see currencies.ts). */
export function CurrencyPicker({ onChange, ...props }: CurrencyPickerProps) {
  const options = useMemo(() => SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })), []);
  return (
    <ReferenceSelect
      placeholder="Select a currency"
      {...props}
      options={options}
      onChange={(value) => onChange(value, pick([...SUPPORTED_CURRENCIES], (c) => c.code, value))}
    />
  );
}
