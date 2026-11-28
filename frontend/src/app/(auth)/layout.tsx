import { Suspense } from "react";
import { RouteGuard, SessionExpiredNotice } from "@/components/auth";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard guestsOnly><Suspense fallback={null}><SessionExpiredNotice /></Suspense>{children}</RouteGuard>;
}
