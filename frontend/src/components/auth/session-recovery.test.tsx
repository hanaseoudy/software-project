import { render, screen, waitFor } from "@testing-library/react";
import { useCurrentUser } from "./auth-provider";
import { refreshSession } from "@/lib/api/client";
import { SessionRecovery } from "./session-recovery";
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
jest.mock("./auth-provider", () => ({ useCurrentUser: jest.fn() }));
jest.mock("@/lib/api/client", () => ({ refreshSession: jest.fn() }));
const reload = jest.fn();
const expire = jest.fn();
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useCurrentUser).mockReturnValue({ user: null, status: "guest", reload, expire, logout: jest.fn() }); });
test("ACC-19 recovers through the shared refresh and rerenders the server page", async () => {
  jest.mocked(refreshSession).mockResolvedValue(true);
  reload.mockResolvedValue({ id: "1" });
  render(<SessionRecovery />);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(expire).not.toHaveBeenCalled();
});
test("ACC-06 redirects through the expiry handler when recovery fails", async () => {
  jest.mocked(refreshSession).mockResolvedValue(false);
  render(<SessionRecovery />);
  await waitFor(() => expect(expire).toHaveBeenCalledTimes(1));
  expect(refresh).not.toHaveBeenCalled();
});
test("GEN-16 reports failure to reload identity without a refresh loop", async () => {
  jest.mocked(refreshSession).mockResolvedValue(true);
  reload.mockResolvedValue(null);
  render(<SessionRecovery />);
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn't restore your session");
  expect(refresh).not.toHaveBeenCalled();
});
