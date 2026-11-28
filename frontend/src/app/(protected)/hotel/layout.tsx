import { RouteGuard } from "@/components/auth";

export default function HotelLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard role="hotel">{children}</RouteGuard>;
}
