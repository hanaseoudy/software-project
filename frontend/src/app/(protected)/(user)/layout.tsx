import { RouteGuard } from "@/components/auth";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard role="user">{children}</RouteGuard>;
}
