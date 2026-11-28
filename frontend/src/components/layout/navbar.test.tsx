import { fireEvent, render, screen } from "@testing-library/react";
import { useCurrentUser } from "@/components/auth";
import { Navbar } from "./navbar";
jest.mock("next/navigation", () => ({ usePathname: () => "/" }));
jest.mock("@/components/auth", () => ({ useCurrentUser: jest.fn() }));
jest.mock("./notification-bell", () => ({ NotificationBell: () => <a href="/notifications">Notifications</a> }));
const auth = jest.mocked(useCurrentUser);
const user = { id: "1", firstName: "Test", lastName: "User", email: "test@example.test", role: "user" as const, providerId: null, providerType: null, emailVerified: true, mustChangePassword: false };
beforeEach(() => { jest.clearAllMocks(); auth.mockReturnValue({ user: null, status: "guest", reload: jest.fn(), logout: jest.fn(), expire: jest.fn() }); });
test("GEN-14 guests see browse and login, and mobile navigation closes after selection", () => {
  render(<Navbar />);
  expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  expect(screen.queryByRole("link", { name: "Accounts" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("link", { name: "Flights" }));
  expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
});
test.each([
  ["user", null, "My itineraries", "/itineraries"],
  ["admin", null, "Accounts", "/admin/system/accounts"],
  ["moderator", "airline", "Airline profile", "/airline/profile"],
  ["moderator", "hotel", "Hotel profile", "/hotel/profile"],
] as const)("GEN-14 shows the %s %s menu", (role, providerType, label, href) => {
  auth.mockReturnValue({ ...auth(), user: { ...user, role, providerType, providerId: providerType ? "provider" : null }, status: "authenticated" });
  render(<Navbar />);
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/notifications");
  expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  if (role !== "admin") expect(screen.queryByRole("link", { name: "Accounts" })).not.toBeInTheDocument();
  if (providerType !== "hotel") expect(screen.queryByRole("link", { name: "Hotel profile" })).not.toBeInTheDocument();
});
test("ACC-06 logout failure provides feedback and permits retry", async () => {
  const logout = jest.fn().mockRejectedValue(new Error("offline"));
  auth.mockReturnValue({ ...auth(), user, status: "authenticated", logout });
  render(<Navbar />);
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn't log you out");
  expect(screen.getByRole("button", { name: "Log out" })).toBeEnabled();
});
