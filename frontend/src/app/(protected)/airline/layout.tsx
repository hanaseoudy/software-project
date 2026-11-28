import { RouteGuard } from "@/components/auth";

export default function AirlineLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard role="airline">{children}</RouteGuard>;
}
