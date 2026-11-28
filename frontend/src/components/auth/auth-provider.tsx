"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch, isUnauthorized } from "@/lib/api";
import { setSessionExpiredHandler } from "@/lib/api/client";
import { loginHref } from "@/lib/auth/navigation";
import type { CurrentUser } from "@/lib/auth/types";

type AuthState = { user: CurrentUser | null; status: "loading" | "authenticated" | "guest" | "error"; error?: unknown };
type AuthContextValue = AuthState & { reload: () => Promise<CurrentUser | null>; logout: () => Promise<void>; expire: () => void };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: "loading" });
  const generation = useRef(0);
  const pending = useRef<Promise<CurrentUser | null> | null>(null);
  const expire = useCallback(() => {
    generation.current++;
    pending.current = null;
    setState({ user: null, status: "guest" });
    // Full navigation drops any private client state belonging to the old session.
    if (window.location.pathname !== "/login") window.location.assign(loginHref(true));
  }, []);
  const reload = useCallback(() => {
    if (pending.current) return pending.current;
    const current = ++generation.current;
    // Keep mounted authenticated pages during revalidation (including SessionRecovery).
    setState(previous => previous.status === "authenticated" ? previous : { user: null, status: "loading" });
    const request = apiFetch<CurrentUser>("/auth/me", { authRedirect: false }).then(user => {
      if (generation.current === current) setState({ user, status: "authenticated" });
      return generation.current === current ? user : null;
    }).catch(error => {
      if (generation.current === current) setState({ user: null, status: isUnauthorized(error) ? "guest" : "error", error });
      return null;
    }).finally(() => {
      if (pending.current === request) pending.current = null;
    });
    pending.current = request;
    return request;
  }, []);
  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST", authRedirect: false });
    generation.current++;
    pending.current = null;
    setState({ user: null, status: "guest" });
    // Full reload also discards private router/client caches after logout.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }, []);
  useEffect(() => setSessionExpiredHandler(expire), [expire]);
  useEffect(() => { void reload(); }, [reload]);
  return <AuthContext.Provider value={{ ...state, reload, logout, expire }}>{children}</AuthContext.Provider>;
}

/** Use reload() after login or a profile/password change to refresh shared identity. */
export function useCurrentUser() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useCurrentUser must be used inside AuthProvider");
  return context;
}
