/**
 * @jest-environment node
 */
// Node environment: it has the real fetch API classes (Response, Headers).
// A minimal `window` stub stands in for the browser.

import { __resetApiClientForTests, apiFetch, refreshSession, setSessionExpiredHandler } from "./client";
import { ApiError } from "./errors";

type Call = { url: string; init: RequestInit };

const assign = jest.fn();
let calls: Call[] = [];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Queues responses per URL; each call takes the next one. */
function mockBackend(routes: Record<string, Array<Response | (() => Response | Promise<Response>)>>) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const queue = routes[url];
    if (!queue || queue.length === 0) throw new Error(`Unexpected request: ${url}`);
    const next = queue.shift()!;
    return typeof next === "function" ? next() : next;
  }) as typeof fetch;
}

const refreshCalls = () => calls.filter((c) => c.url === "/api/auth/refresh").length;

beforeEach(() => {
  __resetApiClientForTests();
  calls = [];
  assign.mockReset();
  (globalThis as unknown as { window: unknown }).window = {
    location: { pathname: "/bookings", search: "?page=2", assign },
  };
});

afterAll(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("apiFetch: requests (ACC-19, GEN-13)", () => {
  it("calls the same-origin /api path, sends cookies and parses JSON", async () => {
    mockBackend({ "/api/hotels/1": [json(200, { id: "1" })] });

    await expect(apiFetch("/hotels/1")).resolves.toEqual({ id: "1" });

    expect(calls[0].url).toBe("/api/hotels/1");
    expect(calls[0].init.credentials).toBe("include");
  });

  it("accepts Swagger paths that already start with /api", async () => {
    mockBackend({ "/api/hotels?page=2": [json(200, { items: [] })] });

    await apiFetch("/api/hotels?page=2");

    expect(calls[0].url).toBe("/api/hotels?page=2");
  });

  it("sends `json` as a JSON body with Content-Type", async () => {
    mockBackend({ "/api/itineraries": [json(201, { id: "it1" })] });

    await apiFetch("/itineraries", { method: "POST", json: { title: "Trip" } });

    const headers = new Headers(calls[0].init.headers);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ title: "Trip" }));
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("passes FormData through untouched (uploads) without forcing a Content-Type", async () => {
    mockBackend({ "/api/hotels/1/images": [json(201, { images: [] })] });
    const form = new FormData();
    form.append("images", new Blob(["x"], { type: "image/png" }), "a.png");

    await apiFetch("/hotels/1/images", { method: "POST", body: form });

    expect(calls[0].init.body).toBe(form);
    expect(new Headers(calls[0].init.headers).has("Content-Type")).toBe(false);
  });

  it("returns undefined for 204 No Content", async () => {
    mockBackend({ "/api/favourites/1": [new Response(null, { status: 204 })] });

    await expect(apiFetch("/favourites/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("rejects absolute URLs so cookies never go to another host", async () => {
    mockBackend({});

    await expect(apiFetch("https://evil.example/api/x")).rejects.toThrow(/must start with/);
    await expect(apiFetch("//evil.example/api/x")).rejects.toThrow(/must start with/);
    expect(calls).toHaveLength(0);
  });
});

describe("apiFetch: one error shape (GEN-02, GEN-16)", () => {
  it("turns a validation error into ApiError with field errors, including nested paths", async () => {
    mockBackend({
      "/api/itineraries": [
        json(400, { message: "Validation failed", errors: { title: ["title must not be empty"], "days.0.city": ["city is required"] } }),
      ],
    });

    const error = await apiFetch("/itineraries", { method: "POST", json: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: "Validation failed",
      fieldErrors: { title: ["title must not be empty"], "days.0.city": ["city is required"] },
    });
  });

  it("uses the backend message for other errors", async () => {
    mockBackend({ "/api/hotels/9": [json(404, { statusCode: 404, message: "Hotel not found", error: "Not Found" })] });

    await expect(apiFetch("/hotels/9")).rejects.toMatchObject({ status: 404, message: "Hotel not found", fieldErrors: {} });
  });

  it("reports a network failure as status 0 with a friendly message", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as typeof fetch;

    await expect(apiFetch("/hotels")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/couldn't reach/) });
  });
});

describe("apiFetch: 401 -> refresh -> retry (ACC-06, ACC-19)", () => {
  it("refreshes once and retries the request after a 401", async () => {
    mockBackend({
      "/api/bookings": [json(401, { message: "Unauthorized" }), json(200, { items: ["b1"] })],
      "/api/auth/refresh": [json(200, { user: {} })],
    });

    await expect(apiFetch("/bookings")).resolves.toEqual({ items: ["b1"] });

    expect(calls.map((c) => c.url)).toEqual(["/api/bookings", "/api/auth/refresh", "/api/bookings"]);
    expect(calls[1].init).toMatchObject({ method: "POST", credentials: "include" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("re-sends the same body on the retry", async () => {
    mockBackend({
      "/api/itineraries": [json(401, {}), json(201, { id: "it1" })],
      "/api/auth/refresh": [json(200, {})],
    });

    await apiFetch("/itineraries", { method: "POST", json: { title: "Trip" } });

    expect(calls[2].init.body).toBe(JSON.stringify({ title: "Trip" }));
  });

  it("shares ONE refresh between parallel 401s (the backend rejects a reused refresh token)", async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => (releaseRefresh = resolve));
    mockBackend({
      "/api/a": [json(401, {}), json(200, "a")],
      "/api/b": [json(401, {}), json(200, "b")],
      "/api/c": [json(401, {}), json(200, "c")],
      "/api/auth/refresh": [async () => (await refreshGate, json(200, {}))],
    });

    const results = Promise.all([apiFetch("/a"), apiFetch("/b"), apiFetch("/c")]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh();

    await expect(results).resolves.toEqual(["a", "b", "c"]);
    expect(refreshCalls()).toBe(1);
  });

  it("retries without a new refresh when a refresh finished after the request started", async () => {
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((resolve) => (releaseSlow = resolve));
    mockBackend({
      "/api/fast": [json(401, {}), json(200, "fast")],
      // Sent with the old cookie; its 401 arrives after the refresh is done.
      "/api/slow": [async () => (await slowGate, json(401, {})), json(200, "slow")],
      "/api/auth/refresh": [json(200, {})],
    });

    const slow = apiFetch("/slow");
    await expect(apiFetch("/fast")).resolves.toBe("fast");
    releaseSlow();

    await expect(slow).resolves.toBe("slow");
    expect(refreshCalls()).toBe(1);
  });

  it("sends the user to /login with a session-expired message when the refresh fails", async () => {
    mockBackend({
      "/api/bookings": [json(401, { message: "Unauthorized" })],
      "/api/auth/refresh": [json(401, { message: "Session expired" })],
    });

    await expect(apiFetch("/bookings")).rejects.toMatchObject({ status: 401 });

    expect(assign).toHaveBeenCalledWith("/login?reason=session-expired&returnTo=%2Fbookings%3Fpage%3D2");
    expect(calls.filter((c) => c.url === "/api/bookings")).toHaveLength(1);
  });

  it("treats a network failure during refresh as an expired session", async () => {
    mockBackend({
      "/api/bookings": [json(401, {})],
      "/api/auth/refresh": [() => Promise.reject(new TypeError("Failed to fetch"))],
    });

    await expect(apiFetch("/bookings")).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("gives up after one retry if the retried request is still 401", async () => {
    mockBackend({
      "/api/bookings": [json(401, {}), json(401, {})],
      "/api/auth/refresh": [json(200, {})],
    });

    await expect(apiFetch("/bookings")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toBe(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("does not redirect when authRedirect is false (guest session checks)", async () => {
    mockBackend({
      "/api/auth/me": [json(401, {})],
      "/api/auth/refresh": [json(401, {})],
    });

    await expect(apiFetch("/auth/me", { authRedirect: false })).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["/auth/login", "/auth/logout", "/auth/refresh"])(
    "never refreshes on a 401 from %s (wrong credentials or already logged out)",
    async (path) => {
      mockBackend({ [`/api${path}`]: [json(401, { message: "Invalid email or password" })] });

      await expect(apiFetch(path, { method: "POST", json: {} })).rejects.toMatchObject({ status: 401 });
      expect(refreshCalls()).toBe(path === "/auth/refresh" ? 1 : 0);
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("does not redirect again when already on /login", async () => {
    (globalThis as unknown as { window: unknown }).window = { location: { pathname: "/login", search: "", assign } };
    mockBackend({ "/api/auth/me": [json(401, {})], "/api/auth/refresh": [json(401, {})] });

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });

  it("lets FND-2 replace the session-expired handler", async () => {
    const handler = jest.fn();
    const restore = setSessionExpiredHandler(handler);
    mockBackend({ "/api/bookings": [json(401, {})], "/api/auth/refresh": [json(401, {})] });

    await expect(apiFetch("/bookings")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    restore();
  });
});

describe("refreshSession", () => {
  it("allows a new refresh after the previous one finished", async () => {
    mockBackend({ "/api/auth/refresh": [json(200, {}), json(200, {})] });

    await expect(refreshSession()).resolves.toBe(true);
    await expect(refreshSession()).resolves.toBe(true);
    expect(refreshCalls()).toBe(2);
  });
});

describe("apiFetch on the server", () => {
  it("throws a clear error pointing to serverFetch", async () => {
    delete (globalThis as { window?: unknown }).window;

    await expect(apiFetch("/hotels")).rejects.toThrow(/serverFetch/);
  });
});
