import type { AccessRole, CurrentUser } from "./types";

export function hasRole(user: CurrentUser, role: AccessRole): boolean {
  return role === "airline" || role === "hotel"
    ? user.role === "moderator" && user.providerType === role && Boolean(user.providerId)
    : user.role === role;
}

export function homeFor(user: CurrentUser): string {
  if (user.role === "admin") return "/admin/system";
  if (hasRole(user, "airline")) return "/airline";
  if (hasRole(user, "hotel")) return "/hotel";
  return "/";
}

/** ACC-10: only local page destinations, never external URLs or auth loops. */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020]/.test(decoded) || decoded.startsWith("//")) return fallback;
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname.startsWith("//") || /^\/(api|login|register|forgot-password)(\/|$)/.test(decodeURIComponent(url.pathname))) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function loginHref(expired = false): string {
  const destination = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search + window.location.hash;
  const params = new URLSearchParams({ returnTo: safeReturnTo(destination) });
  if (expired) params.set("reason", "session-expired");
  return `/login?${params}`;
}
