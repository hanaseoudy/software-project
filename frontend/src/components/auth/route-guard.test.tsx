import { render, screen } from "@testing-library/react";
import { useCurrentUser } from "./auth-provider";
import { RouteGuard } from "./route-guard";
const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
jest.mock("./auth-provider", () => ({ useCurrentUser: jest.fn() }));
const auth = jest.mocked(useCurrentUser);
const user = { id: "1", firstName: "Test", lastName: "User", email: "test@example.test", role: "user" as const, providerId: null, providerType: null, emailVerified: true, mustChangePassword: false };
beforeEach(() => { jest.clearAllMocks(); window.history.replaceState(null, "", "/bookings/flights?upcoming=true"); auth.mockReturnValue({ user, status: "authenticated", reload: jest.fn(), logout: jest.fn(), expire: jest.fn() }); });
test("ACC-10 waits for session recovery before redirecting and preserves the requested action", () => {
  auth.mockReturnValue({ ...auth(), user: null, status: "loading" });
  const view = render(<RouteGuard><p>Private data</p></RouteGuard>);
  expect(replace).not.toHaveBeenCalled();
  expect(screen.queryByText("Private data")).not.toBeInTheDocument();
  auth.mockReturnValue({ ...auth(), status: "guest" });
  view.rerender(<RouteGuard><p>Private data</p></RouteGuard>);
  expect(replace).toHaveBeenCalledWith("/login?returnTo=%2Fbookings%2Fflights%3Fupcoming%3Dtrue");
});
test("ACC-11 denies another role without rendering protected content", () => {
  render(<RouteGuard role="admin"><p>Private data</p></RouteGuard>);
  expect(screen.getByText("No access")).toBeInTheDocument();
  expect(screen.queryByText("Private data")).not.toBeInTheDocument();
});
test("ACC-11 allows the assigned hotel moderator only", () => {
  auth.mockReturnValue({ ...auth(), user: { ...user, role: "moderator", providerType: "hotel", providerId: "h" } });
  render(<RouteGuard role="hotel"><p>Hotel data</p></RouteGuard>);
  expect(screen.getByText("Hotel data")).toBeInTheDocument();
});
test("ACC-04 guest-only pages send signed-in admins to their home", () => {
  auth.mockReturnValue({ ...auth(), user: { ...user, role: "admin" } });
  render(<RouteGuard guestsOnly>Login form</RouteGuard>);
  expect(replace).toHaveBeenCalledWith("/admin/system");
  expect(screen.queryByText("Login form")).not.toBeInTheDocument();
});
test("ACC-10 guest-only pages honour safe returnTo after login", () => {
  window.history.replaceState(null, "", "/login?returnTo=%2Fflights%2Fbook%3Fid%3D123");
  render(<RouteGuard guestsOnly>Login form</RouteGuard>);
  expect(replace).toHaveBeenCalledWith("/flights/book?id=123");
});
