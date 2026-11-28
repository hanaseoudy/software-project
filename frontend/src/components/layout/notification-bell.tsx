"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export function NotificationBell() {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const [result, setResult] = useState<{ key: string; count?: number; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.id}:${pathname}:${attempt}`;
  useEffect(() => {
    if (!user) return;
    let active = true;
    void apiFetch<{ unreadCount: number }>("/notifications/unread-count").then(({ unreadCount }) => {
      if (active) setResult({ key, count: unreadCount });
    }).catch(() => { if (active) setResult({ key, failed: true }); });
    return () => { active = false; };
  }, [user, key]);
  if (!user) return null;
  const current = result?.key === key ? result : null;
  const label = current?.failed ? "Notifications (count unavailable)" : current?.count === undefined ? "Notifications (loading count)" : `Notifications (${current.count} unread)`;
  return <div className="flex flex-wrap items-center gap-2">
    <Link href="/notifications" aria-label={label} className="inline-flex min-h-11 items-center gap-2 rounded-base border-2 border-border bg-secondary-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Bell className="size-5" aria-hidden="true" />
      <span>Notifications</span>
      <span aria-hidden="true">{current?.failed ? "!" : current?.count ?? "…"}</span>
    </Link>
    {current?.failed && <Button variant="noShadow" onClick={() => setAttempt(value => value + 1)} aria-label="Retry notification count">Retry</Button>}
  </div>;
}
