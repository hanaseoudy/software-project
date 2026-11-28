"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSession } from "@/lib/api/client";
import { ErrorState, LoadingState } from "@/components/feedback";
import { useCurrentUser } from "./auth-provider";

/** Render from a page that catches serverFetch's 401; never rethrow that error. */
export function SessionRecovery() {
  const { status, reload, expire } = useCurrentUser();
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (status === "loading" || started.current) return;
    started.current = true;
    void refreshSession().then(async success => {
      if (!success) { expire(); return; }
      const user = await reload();
      if (!user) { setFailed(true); return; }
      router.refresh();
    });
  }, [status, reload, expire, router]);
  if (failed) return <ErrorState message="We couldn't restore your session. Please reload this page to try again." onRetry={() => window.location.reload()} />;
  return <LoadingState label="Restoring your session…" />;
}
