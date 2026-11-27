// One error shape for every failed backend call (GEN-16 feedback, GEN-02 field errors).
//
// The backend answers errors in two shapes:
//   validation (GEN-02): { message: "Validation failed", errors: { "days.0.city": ["..."] } }
//   other Nest errors:   { statusCode, message: string | string[], error }
// Both become an ApiError with `status`, `message` and `fieldErrors`.

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  /** Field-level messages keyed by field path, e.g. "email" or "days.0.city". Empty if none. */
  readonly fieldErrors: FieldErrors;
  /** The raw response body, for the rare case a page needs more. */
  readonly body: unknown;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.body = body;
  }
}

/** Status used when the request never reached the backend (offline, DNS, CORS...). */
export const NETWORK_ERROR_STATUS = 0;

const FALLBACK_MESSAGES: Record<number, string> = {
  [NETWORK_ERROR_STATUS]: "We couldn't reach the server. Check your connection and try again.",
  400: "Some of the information is not valid.",
  401: "Please log in to continue.",
  403: "You don't have permission to do this.",
  404: "We couldn't find what you were looking for.",
  409: "This conflicts with existing data.",
  413: "The upload is too large.",
  423: "This account is temporarily locked.",
  429: "Too many requests. Please wait a moment and try again.",
};

function fallbackMessage(status: number): string {
  if (FALLBACK_MESSAGES[status]) return FALLBACK_MESSAGES[status];
  if (status >= 500) return "Something went wrong on our side. Please try again later.";
  return "Something went wrong. Please try again.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFieldErrors(value: unknown): FieldErrors {
  if (!isRecord(value)) return {};
  const result: FieldErrors = {};
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) {
      const strings = messages.filter((m): m is string => typeof m === "string");
      if (strings.length) result[field] = strings;
    } else if (typeof messages === "string") {
      result[field] = [messages];
    }
  }
  return result;
}

/** Builds an ApiError from a status code and a parsed (or unparsed) response body. */
export function toApiError(status: number, body: unknown): ApiError {
  let message = "";
  let fieldErrors: FieldErrors = {};

  if (isRecord(body)) {
    const raw = body.message;
    if (typeof raw === "string") message = raw;
    else if (Array.isArray(raw)) message = raw.filter((m) => typeof m === "string").join(" ");
    fieldErrors = toFieldErrors(body.errors);
  } else if (typeof body === "string" && body.trim() && body.length <= 300 && !body.trim().startsWith("<")) {
    message = body.trim();
  }

  return new ApiError(status, message || fallbackMessage(status), fieldErrors, body);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True when the backend said the user is not logged in (or the session could not be refreshed). */
export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/** Parses a fetch Response body: JSON when possible, otherwise text, undefined when empty. */
export async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json") || type.includes("+json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
