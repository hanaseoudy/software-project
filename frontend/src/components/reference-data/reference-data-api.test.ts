import { apiFetch } from "@/lib/api";

import { clearReferenceDataCache, getAirports, getCities, getCountries } from "./reference-data-api";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const mockFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const page = (items: unknown[], pageNo: number, totalPages: number) => ({
  items,
  total: 25,
  page: pageNo,
  pageSize: 10,
  totalPages,
});

beforeEach(() => {
  clearReferenceDataCache();
  mockFetch.mockReset();
});

describe("reference-data API (GEN-12)", () => {
  it("reads the airports list once and caches it", async () => {
    mockFetch.mockResolvedValue([{ id: "a1", iataCode: "CAI" }]);
    await getAirports();
    await getAirports();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/airports");
  });

  it("reads every page of countries", async () => {
    mockFetch
      .mockResolvedValueOnce(page([{ code: "EG" }], 1, 3))
      .mockResolvedValueOnce(page([{ code: "AE" }], 2, 3))
      .mockResolvedValueOnce(page([{ code: "GB" }], 3, 3));
    const countries = await getCountries();
    expect(countries.map((c) => c.code)).toEqual(["EG", "AE", "GB"]);
    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([
      "/countries?page=1",
      "/countries?page=2",
      "/countries?page=3",
    ]);
  });

  it("filters cities by country and caches each country separately", async () => {
    mockFetch.mockResolvedValue(page([{ cityId: "cairo" }], 1, 1));
    await getCities("EG");
    await getCities("EG");
    await getCities("AE");
    await getCities();
    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([
      "/cities?country=EG&page=1",
      "/cities?country=AE&page=1",
      "/cities?page=1",
    ]);
  });

  it("stops at an empty list (totalPages 0)", async () => {
    mockFetch.mockResolvedValue(page([], 1, 0));
    expect(await getCountries()).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure, so a retry asks again", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([{ id: "a1" }]);
    await expect(getAirports()).rejects.toThrow("offline");
    await expect(getAirports()).resolves.toEqual([{ id: "a1" }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
