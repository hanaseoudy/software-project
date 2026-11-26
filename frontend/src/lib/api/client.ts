// apiFetch: the one way to call the backend from the browser (client components).
// For Server Components use serverFetch from "@/lib/api/server".
//
// - Calls /api/* on the frontend's own origin; next.config.ts forwards it to the
//   backend, so the httpOnly auth cookies are first-party (ACC-19). Never store
//   tokens in localStorage, sessionStorage or JS-readable cookies.
// - Always sends cookies (credentials: "include").
// - Turns every failure into an ApiError (status, message, fieldErrors).
// - On a 401 it calls POST /api/auth/refresh once and retries the request once.
//   Parallel 401s share ONE refresh call: the backend rotates the refresh token
//   and rejects a token that was already used, so two refreshes at the same
//   time would log the user out.
// - If the session cannot be refreshed (ACC-06 idle expiry, logout elsewhere),
//   it sends the user to /login?reason=session-expired&returnTo=<current page>.
//
// Usage:
//   const hotel = await apiFetch<HotelResponse>(`/hotels/${id}`);
//   await apiFetch("/itineraries", { method: "POST", json: { title } });
//   await apiFetch(`/hotels/${id}/images`, { method: "POST", body: formData });
//   // Checking for a session without redirecting guests to /login:
//   const me = await apiFetch<Me>("/auth/me", { authRedirect: false });

import { ApiError, NETWORK_ERROR_STATUS, readBody, toApiError } from "./errors";
import { buildInit, toApiPath, type ApiRequestInit } from "./request";

export type ApiFetchInit = ApiRequestInit & {
  /**
   * What to do when the session is gone and cannot be refreshed.
   * true (default): run the session-expired handler (redirect to /login), then throw ApiError 401.
   * false: only throw ApiError 401. Use it for "is anyone logged in?" checks on public pages.
   */
  authRedirect?: boolean;
};

export const REFRESH_PATH = "/api/auth/refresh";

// A 401 from these endpoints means "wrong credentials" or "already logged out",
// not "access token expired", so they never trigger a refresh.
const NO_REFRESH_PATHS = new Set(["/api/auth/login", REFRESH_PATH, "/api/auth/logout"]);

type SessionExpiredHandler = () => void;

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  const params = new URLSearchParams({ reason: "session-expired", returnTo: pathname + search });
  // A full page load on purpose: it drops all client state of the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?${params.toString()}`);
}

let sessionExpiredHandler: SessionExpiredHandler = redirectToLogin;
let refreshInFlight: Promise<boolean> | null = null;
// Increases after every successful refresh. A request that started before a
// refresh finished can simply be retried with the new cookie.
let sessionGeneration = 0;

/**
 * Replaces what happens when the session expires (default: redirect to /login).
 * FND-2's auth context can use it to clear the current user first.
 * Returns a function that restores the previous handler.
 */
export function setSessionExpiredHandler(handler: SessionExpiredHandler): () => void {
  const previous = sessionExpiredHandler;
  sessionExpiredHandler = handler;
  return () => {
    sessionExpiredHandler = previous;
  };
}

/**
 * Refreshes the session with the refresh_token cookie. Concurrent callers share
 * the same request. Resolves true when new cookies were issued.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(REFRESH_PATH, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (response.ok) sessionGeneration += 1;
        return response.ok;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, credentials: "include" });
  } catch (cause) {
    const error = toApiError(NETWORK_ERROR_STATUS, undefined);
    (error as ApiError & { cause?: unknown }).cause = cause;
    throw error;
  }
}

function pathOnly(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

export async function apiFetch<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error("apiFetch runs in the browser only. In Server Components use serverFetch from @/lib/api/server.");
  }

  const { authRedirect = true, ...requestInit } = init;
  const url = toApiPath(path);
  const request = buildInit(requestInit);
  const generationAtStart = sessionGeneration;

  let response = await send(url, request);

  if (response.status === 401 && !NO_REFRESH_PATHS.has(pathOnly(url))) {
    const refreshed = generationAtStart !== sessionGeneration || (await refreshSession());
    if (refreshed) response = await send(url, request);

    if (!refreshed || response.status === 401) {
      const body = await readBody(response);
      if (authRedirect) sessionExpiredHandler();
      throw toApiError(401, body);
    }
  }

  const body = await readBody(response);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

/** Test helper: resets the module state between tests. */
export function __resetApiClientForTests(): void {
  sessionExpiredHandler = redirectToLogin;
  refreshInFlight = null;
  sessionGeneration = 0;
}
