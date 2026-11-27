"use client";

// GEN-12 preview for the design-system page: the four reference-data pickers.
// The airport, country and city lists come from the running backend; the city list
// follows the chosen country, and the country's currency fills the currency picker.

import { useState } from "react";

import { AirportPicker, CityPicker, CountryPicker, CurrencyPicker } from "@/components/reference-data";

export function ReferenceDataDemo() {
  const [airport, setAirport] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AirportPicker label="Airport" value={airport} onChange={setAirport} />
        <CountryPicker
          label="Country"
          value={country}
          onChange={(code, selected) => {
            setCountry(code);
            setCity("");
            if (selected) setCurrency(selected.currency);
          }}
        />
        <CityPicker label="City (of the chosen country)" country={country || undefined} value={city} onChange={setCity} />
        <CurrencyPicker label="Currency" value={currency} onChange={setCurrency} />
        <AirportPicker label="Airport with a validation error" value="" onChange={() => {}} error="Departure airport must be a 3-letter IATA code" />
      </div>
      <p className="text-sm">
        Chosen: airport <code>{airport || "none"}</code>, country <code>{country || "none"}</code>, city{" "}
        <code>{city || "none"}</code>, currency <code>{currency || "none"}</code>
      </p>
    </div>
  );
}
