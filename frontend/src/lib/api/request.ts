// Helpers shared by apiFetch (browser) and serverFetch (server).

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  /** Raw body (FormData for uploads, a string...). Use `json` for JSON bodies. */
  body?: BodyInit | null;
  /** A value to send as JSON. Sets Content-Type: application/json. */
  json?: unknown;
};

/**
 * Normalises a backend path to "/api/...".
 * Accepts the Swagger path with or without the /api prefix:
 * "/hotels" and "/api/hotels" both become "/api/hotels".
 * Absolute URLs are rejected so cookies are never sent to another host.
 */
export function toApiPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`API paths must start with "/" (got "${path}"). Absolute URLs are not allowed.`);
  }
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/api?")) return path;
  return `/api${path}`;
}

/** Builds the fetch options: JSON encoding and an Accept header. */
export function buildInit(init: ApiRequestInit): RequestInit {
  const { json, headers: rawHeaders, body, ...rest } = init;
  const headers = new Headers(rawHeaders);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (json !== undefined) {
    if (body !== undefined && body !== null) {
      throw new Error("Pass either `json` or `body`, not both.");
    }
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return { ...rest, headers, body: JSON.stringify(json) };
  }

  return { ...rest, headers, body };
}
