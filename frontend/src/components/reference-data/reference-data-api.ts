// GEN-12: the seeded reference data, as the backend serves it.
//   GET /api/airports                          -> Airport[]              (not paginated)
//   GET /api/countries?page=                   -> Paginated<Country>     (page size 10)
//   GET /api/cities?country=<code|id>&page=    -> Paginated<City>        (page size 10)
// A picker needs the whole list, so the countries and cities loaders read every page.
// Results are cached for the session (the data is seeded and does not change while the
// app is open); a failed request is not cached, so "Try again" really asks again.

import { apiFetch, type Paginated } from "@/lib/api";

export interface Airport {
  /** Database id (used when a flight is created, FLT-03). */
  id: string;
  /** 3-letter IATA code (used by flight search, FLT-11). */
  iataCode: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export interface Country {
  /** Database id (used by hotels). */
  id: string;
  /** 2-letter code, e.g. "EG". */
  code: string;
  name: string;
  currency: string;
}

export interface City {
  /** Database id (used by hotels). */
  id: string;
  /** Reference-data city id, e.g. "cairo" (used by itineraries). */
  cityId: string;
  name: string;
  countryCode: string;
}

/** Safety stop in case the backend ever reports a wrong totalPages. */
const MAX_PAGES = 50;

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let promise = cache.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = load().catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return promise;
}

/** Forgets what was loaded (used by "Try again" and by tests). */
export function clearReferenceDataCache(): void {
  cache.clear();
}

async function readAllPages<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({ ...params, page: String(page) });
    const result = await apiFetch<Paginated<T>>(`${path}?${query.toString()}`);
    items.push(...result.items);
    if (page >= result.totalPages) break;
  }
  return items;
}

export function getAirports(): Promise<Airport[]> {
  return cached("airports", () => apiFetch<Airport[]>("/airports"));
}

export function getCountries(): Promise<Country[]> {
  return cached("countries", () => readAllPages<Country>("/countries"));
}

/** Cities of one country (a 2-letter code or a country id), or all cities. */
export function getCities(country?: string): Promise<City[]> {
  return cached(`cities:${country ?? ""}`, () => readAllPages<City>("/cities", country ? { country } : {}));
}
