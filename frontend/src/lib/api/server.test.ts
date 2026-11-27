/**
 * @jest-environment node
 */
import { serverFetch } from "./server";

const cookieStore = new Map<string, string>();
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
  }),
}));

const ORIGINAL_ENV = process.env;
let fetchMock: jest.Mock;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, BACKEND_URL: "http://backend.test:3000/" };
  cookieStore.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as typeof fetch;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("serverFetch (read-only session)", () => {
  it("calls BACKEND_URL directly and forwards only the access_token cookie", async () => {
    cookieStore.set("access_token", "abc");
    cookieStore.set("other", "ignored");
    fetchMock.mockResolvedValue(json(200, { id: "u1" }));

    await expect(serverFetch("/auth/me")).resolves.toEqual({ id: "u1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test:3000/api/auth/me");
    expect(new Headers(init.headers).get("Cookie")).toBe("access_token=abc");
    expect(init.cache).toBe("no-store");
  });

  it("sends no Cookie header for guests", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [] }));

    await serverFetch("/hotels?page=1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test:3000/api/hotels?page=1");
    expect(new Headers(init.headers).has("Cookie")).toBe(false);
  });

  it("throws ApiError 401 and never calls refresh (the page shows FND-2's recovery instead)", async () => {
    cookieStore.set("access_token", "expired");
    fetchMock.mockResolvedValue(json(401, { message: "Unauthorized" }));

    await expect(serverFetch("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the same error shape as apiFetch", async () => {
    fetchMock.mockResolvedValue(json(400, { message: "Validation failed", errors: { page: ["page must be a positive integer"] } }));

    await expect(serverFetch("/hotels?page=0")).rejects.toMatchObject({
      status: 400,
      fieldErrors: { page: ["page must be a positive integer"] },
    });
  });

  it("lets a caller opt into caching for public data", async () => {
    fetchMock.mockResolvedValue(json(200, []));

    await serverFetch("/reference-data/countries", { cache: "force-cache" });

    expect(fetchMock.mock.calls[0][1].cache).toBe("force-cache");
  });
});
