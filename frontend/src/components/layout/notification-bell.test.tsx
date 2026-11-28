import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCurrentUser } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { NotificationBell } from "./notification-bell";
let pathname = "/";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));
jest.mock("@/components/auth", () => ({ useCurrentUser: jest.fn() }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const api = jest.mocked(apiFetch);
const auth = jest.mocked(useCurrentUser);
const user = { id: "1", firstName: "Test", lastName: "User", email: "test@example.test", role: "user" as const, providerId: null, providerType: null, emailVerified: true, mustChangePassword: false };
beforeEach(() => { jest.clearAllMocks(); pathname = "/"; auth.mockReturnValue({ user, status: "authenticated", reload: jest.fn(), logout: jest.fn(), expire: jest.fn() }); });
test("GEN-01 displays unread count and links directly to notifications", async () => {
  api.mockResolvedValue({ unreadCount: 3 });
  render(<NotificationBell />);
  expect(await screen.findByRole("link", { name: "Notifications (3 unread)" })).toHaveAttribute("href", "/notifications");
  expect(api).toHaveBeenCalledWith("/notifications/unread-count");
});
test("GEN-01 guests make no notification request", () => {
  auth.mockReturnValue({ ...auth(), user: null, status: "guest" });
  render(<NotificationBell />);
  expect(api).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
test("GEN-16 failed counts remain unavailable, not zero, and can be retried", async () => {
  api.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ unreadCount: 0 });
  render(<NotificationBell />);
  expect(await screen.findByRole("link", { name: "Notifications (count unavailable)" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry notification count" }));
  expect(await screen.findByRole("link", { name: "Notifications (0 unread)" })).toBeInTheDocument();
});
test("GEN-01 refreshes on navigation and ignores a stale response", async () => {
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce({ unreadCount: 1 });
  const view = render(<NotificationBell />);
  pathname = "/notifications";
  view.rerender(<NotificationBell />);
  await screen.findByRole("link", { name: "Notifications (1 unread)" });
  await act(async () => resolve({ unreadCount: 9 }));
  await waitFor(() => expect(screen.getByRole("link")).toHaveAccessibleName("Notifications (1 unread)"));
});
