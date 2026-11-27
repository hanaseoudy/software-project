// Browser-safe API exports. serverFetch is imported separately from
// "@/lib/api/server" because it uses next/headers (server only).
export { apiFetch, refreshSession, setSessionExpiredHandler, type ApiFetchInit } from "./client";
export { ApiError, isApiError, isUnauthorized, NETWORK_ERROR_STATUS, type FieldErrors } from "./errors";
export type { Paginated } from "./types";
