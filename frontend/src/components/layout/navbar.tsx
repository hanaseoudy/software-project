"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useCurrentUser } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { hasRole } from "@/lib/auth/navigation";
import { NotificationBell } from "./notification-bell";

type NavLink = readonly [label: string, href: string];
const browse: NavLink[] = [["Flights", "/flights"], ["Hotels", "/hotels"], ["Explore itineraries", "/explore"], ["Blog", "/blog"]];
const traveler: NavLink[] = [["Flight bookings", "/bookings/flights"], ["Hotel bookings", "/bookings/hotels"], ["My itineraries", "/itineraries"], ["My posts", "/blog/mine"], ["Favourites", "/favourites"]];
const admin: NavLink[] = [["Dashboard", "/admin/system"], ["Accounts", "/admin/system/accounts"], ["Providers", "/admin/system/providers"], ["Bookings", "/admin/system/bookings"], ["Reports", "/admin/system/reports"], ["Audit logs", "/admin/system/audit-logs"]];
const airline: NavLink[] = [["Dashboard", "/airline"], ["Airline profile", "/airline/profile"], ["Policies", "/airline/policies"], ["Add flight", "/airline/flights/new"]];
const hotel: NavLink[] = [["Dashboard", "/hotel"], ["Hotel profile", "/hotel/profile"], ["Policies", "/hotel/policies"], ["Add room", "/hotel/rooms/new"], ["Reservations", "/hotel/reservations"], ["Reviews", "/hotel/reviews"]];

export function Navbar() {
  const { user, status, logout, reload } = useCurrentUser();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const links = user?.role === "admin" ? admin : user && hasRole(user, "airline") ? airline : user && hasRole(user, "hotel") ? hotel : browse;
  const renderLinks = (items: NavLink[]) => items.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={pathname === href ? "page" : undefined} className="rounded-base px-3 py-2 font-medium hover:underline aria-[current=page]:bg-mustard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{label}</Link>);
  async function signOut() {
    setLoggingOut(true);
    setLogoutError(false);
    try { await logout(); } catch { setLogoutError(true); }
    finally { setLoggingOut(false); }
  }
  return <header className="border-b-2 border-border bg-background text-foreground">
    <a href="#page-content" className="sr-only focus:not-sr-only focus:inline-block focus:p-3">Skip to content</a>
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" onClick={() => setOpen(false)} className="font-display text-2xl font-bold text-main">Travel Planner</Link>
        <Button variant="secondary" className="md:hidden" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}Menu</Button>
      </div>
      <nav id="main-navigation" aria-label="Main navigation" className={`${open ? "flex" : "hidden"} mt-4 flex-col gap-4 md:flex`}>
        <div className="flex flex-wrap gap-1">{renderLinks(links)}</div>
        {user?.role === "user" && <div aria-label="My travel" className="flex flex-wrap gap-1 border-t-2 border-border pt-3">{renderLinks(traveler)}</div>}
        <div className="flex flex-wrap items-center gap-3">
          {status === "loading" && <span role="status">Checking your session…</span>}
          {status === "error" && <><span role="status">Account unavailable</span><Button variant="secondary" onClick={() => void reload()}>Retry account</Button></>}
          {status === "guest" && renderLinks([["Log in", "/login"], ["Register", "/register"]])}
          {user && <><NotificationBell />{renderLinks([["Account", "/account"], ["Change password", "/change-password"]])}<Button variant="secondary" disabled={loggingOut} onClick={() => void signOut()}>{loggingOut ? "Logging out…" : "Log out"}</Button></>}
        </div>
        {logoutError && <p role="alert">We couldn&apos;t log you out. Please try again.</p>}
      </nav>
    </div>
  </header>;
}
