// serverFetch: call the backend from Server Components, Route Handlers and
// Server Functions. For client components use apiFetch from "@/lib/api/client".
//
// It is READ-ONLY with respect to the session:
// - it forwards the incoming access_token cookie to the backend (server to server);
// - it never refreshes the session and never sets cookies. Next.js does not
//   allow setting cookies while a Server Component renders, and the
//   refresh_token cookie (path /api/auth) is not sent with page requests anyway.
// - on an expired or missing session it throws ApiError 401. The page should
//   then render FND-2's session recovery component, which refreshes in the
//   browser and re-renders (see frontend/README.md, "Session refresh").
//
// Usage (Server Component):
//   const page = await serverFetch<Paginated<Hotel>>("/hotels?page=1");
//   try { await serverFetch("/auth/me") } catch (e) { if (isUnauthorized(e)) ... }

import { cookies } from "next/headers";

import { getBackendUrl } from "./backend-url";
import { NETWORK_ERROR_STATUS, readBody, toApiError } from "./errors";
import { buildInit, toApiPath, type ApiRequestInit } from "./request";

/** Name of the backend's access-token cookie (backend/src/auth/auth.cookies.ts). */
export const ACCESS_COOKIE = "access_token";

export async function serverFetch<T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const url = getBackendUrl() + toApiPath(path);
  const request = buildInit({ cache: "no-store", ...init });

  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  const headers = new Headers(request.headers);
  if (accessToken) headers.set("Cookie", `${ACCESS_COOKIE}=${accessToken}`);
  else headers.delete("Cookie");

  let response: Response;
  try {
    response = await fetch(url, { ...request, headers });
  } catch (cause) {
    const error = toApiError(NETWORK_ERROR_STATUS, undefined);
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }

  const body = await readBody(response);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}
