import { RouteGuard } from "@/components/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard role="admin">{children}</RouteGuard>;
}
