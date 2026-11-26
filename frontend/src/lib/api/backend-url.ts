// Server-only configuration: the address of the NestJS backend.
//
// BACKEND_URL is read on the server only (next.config.ts rewrites and
// serverFetch). It is intentionally NOT a NEXT_PUBLIC_ variable: the browser
// never calls the backend directly, it calls /api/* on the frontend's own
// origin and Next.js forwards the request (see next.config.ts).

export const DEV_BACKEND_URL = "http://localhost:3000";

/**
 * Returns BACKEND_URL without a trailing slash.
 * In development it falls back to http://localhost:3000. Anywhere else a
 * missing value is an error, so a deployment can never silently proxy to localhost.
 */
export function getBackendUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.BACKEND_URL?.trim();

  if (!value) {
    if (env.NODE_ENV === "development") return DEV_BACKEND_URL;
    throw new Error(
      "BACKEND_URL is not set. Set it to the NestJS backend address, for example http://localhost:3000 " +
        "(see frontend/.env.example).",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`BACKEND_URL is not a valid URL: "${value}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`BACKEND_URL must start with http:// or https://, got "${value}"`);
  }

  return value.replace(/\/+$/, "");
}
