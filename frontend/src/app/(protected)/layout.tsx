import { RouteGuard } from "@/components/auth";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard>{children}</RouteGuard>;
}
