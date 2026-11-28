"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/feedback";
import { hasRole, homeFor, loginHref, safeReturnTo } from "@/lib/auth/navigation";
import type { AccessRole } from "@/lib/auth/types";
import { useCurrentUser } from "./auth-provider";

/** UX only: pages and backend endpoints must still enforce ownership/authorization. */
export function RouteGuard({ children, guestsOnly = false, role }: {
  children: React.ReactNode; guestsOnly?: boolean; role?: AccessRole;
}) {
  const { user, status, error, reload } = useCurrentUser();
  const router = useRouter();
  useEffect(() => {
    if (status === "guest" && !guestsOnly) router.replace(loginHref());
    if (status === "authenticated" && user && guestsOnly) {
      router.replace(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), homeFor(user)));
    }
  }, [status, user, guestsOnly, router]);
  if (status === "error") return <ErrorState error={error} onRetry={reload} />;
  if (status === "loading" || (guestsOnly ? status !== "guest" : status !== "authenticated")) return <LoadingState label="Checking your session…" />;
  if (user && role && !hasRole(user, role)) return <ErrorState title="No access" message="Your account cannot open this page." backHref={homeFor(user)} backLabel="Go to your home page" />;
  return children;
}
