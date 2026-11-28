"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function SessionExpiredNotice() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname !== "/login" || params.get("reason") !== "session-expired") return null;
  return <p role="status" className="mx-auto my-4 max-w-lg rounded-base border-2 border-border bg-mustard p-4 text-foreground">Your session expired, please log in again.</p>;
}
