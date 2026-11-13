/**
 * GEN-16: one way to call the backend. Every failure becomes an ApiError with a
 * message a user can understand and act on, plus the per-field messages from
 * GEN-02 so forms can show them under the right input.
 *
 * Backend error body (GlobalExceptionFilter):
 *   { statusCode, message: string | string[], error, errors?: Record<field, string[]>, errorCode? }
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when trying the same request again may work (network, timeout, server or rate limit). */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }

  get hasFieldErrors(): boolean {
    return Object.keys(this.fieldErrors).length > 0;
  }
}

/** Messages for when the server gives nothing better, written as "what happened + what to do". */
export function friendlyMessage(status: number): string {
  if (status === 0) return 'We couldn’t reach the server. Check your internet connection and try again.';
  if (status === 400) return 'Some details aren’t right. Check the highlighted fields and try again.';
  if (status === 401) return 'Your session has ended. Please log in again to continue.';
  if (status === 403) return 'Your account can’t do this. If you think it should, contact an admin.';
  if (status === 404) return 'We couldn’t find what you were looking for. It may have been removed.';
  if (status === 408) return 'The server took too long to answer. Please try again.';
  if (status === 409) return 'This was changed by someone else or is no longer available. Refresh and try again.';
  if (status === 413) return 'The file is too large. Images can be up to 5 MB.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

interface ErrorBody {
  message?: string | string[];
  errors?: Record<string, string[]>;
  errorCode?: string;
}

// Short technical texts that don't tell the user what to do; replaced by friendlyMessage().
const GENERIC_SERVER_MESSAGES = new Set([
  'Validation failed',
  'Internal server error',
  'Bad Request',
  'Not Found',
  'Not authenticated',
  'Unauthorized',
  'Forbidden',
  'Forbidden resource',
]);

/** Builds an ApiError from a failed response, preferring the backend's own message when it is specific. */
export async function toApiError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // Non-JSON error (e.g. proxy page): fall back to the friendly message.
  }
  const raw = Array.isArray(body.message) ? body.message.join(' ') : body.message;
  const useServer = raw && res.status < 500 && !GENERIC_SERVER_MESSAGES.has(raw);
  const fieldErrors = body.errors && typeof body.errors === 'object' ? body.errors : {};
  return new ApiError(useServer ? raw : friendlyMessage(res.status), res.status, fieldErrors, body.errorCode);
}

/**
 * fetch() for the backend: sends cookies, JSON in and out, and throws ApiError
 * on any failure (including no connection, as status 0).
 */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(friendlyMessage(0), 0);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Turns any thrown value into a message for the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return friendlyMessage(-1);
}
