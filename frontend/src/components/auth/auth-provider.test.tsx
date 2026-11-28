import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch, ApiError } from "@/lib/api";
import { setSessionExpiredHandler } from "@/lib/api/client";
import { AuthProvider, useCurrentUser } from "./auth-provider";

jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), apiFetch: jest.fn() }));
jest.mock("@/lib/api/client", () => ({ setSessionExpiredHandler: jest.fn(() => jest.fn()) }));
const api = jest.mocked(apiFetch);
const user = { id: "1", firstName: "Hana", role: "moderator", providerType: "hotel", providerId: "hotel-1" };
function Consumer() {
  const { status, user, reload, logout } = useCurrentUser();
  return <><span>{status}</span><span>{user?.providerId}</span><button onClick={() => void reload()}>Reload</button><button onClick={() => void logout().catch(() => undefined)}>Logout</button></>;
}
beforeEach(() => { jest.clearAllMocks(); window.history.replaceState(null, "", "/login"); });
test("ACC-19 loads identity and provider without redirecting guests", async () => {
  api.mockResolvedValue(user);
  render(<AuthProvider><Consumer /></AuthProvider>);
  expect(screen.getByText("loading")).toBeInTheDocument();
  expect(await screen.findByText("hotel-1")).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/auth/me", { authRedirect: false });
});
test("ACC-19 distinguishes no session from a recoverable server error", async () => {
  api.mockRejectedValueOnce(new ApiError(401, "Not authenticated"));
  render(<AuthProvider><Consumer /></AuthProvider>);
  expect(await screen.findByText("guest")).toBeInTheDocument();
  api.mockRejectedValueOnce(new ApiError(503, "Unavailable"));
  fireEvent.click(screen.getByText("Reload"));
  expect(await screen.findByText("error")).toBeInTheDocument();
  api.mockResolvedValueOnce(user);
  fireEvent.click(screen.getByText("Reload"));
  expect(await screen.findByText("authenticated")).toBeInTheDocument();
});
test("ACC-06 failed logout retains identity so the user can retry", async () => {
  api.mockResolvedValueOnce(user).mockRejectedValueOnce(new ApiError(0, "Offline"));
  render(<AuthProvider><Consumer /></AuthProvider>);
  await screen.findByText("authenticated");
  fireEvent.click(screen.getByText("Logout"));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/auth/logout", { method: "POST", authRedirect: false }));
  expect(screen.getByText("hotel-1")).toBeInTheDocument();
});
test("ACC-06 expiry clears identity and ignores an older identity response", async () => {
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { unmount } = render(<AuthProvider><Consumer /></AuthProvider>);
  const expire = jest.mocked(setSessionExpiredHandler).mock.calls[0][0];
  act(() => expire());
  await act(async () => resolve(user));
  expect(screen.getByText("guest")).toBeInTheDocument();
  expect(screen.queryByText("hotel-1")).not.toBeInTheDocument();
  const cleanup = jest.mocked(setSessionExpiredHandler).mock.results[0].value;
  unmount();
  expect(cleanup).toHaveBeenCalled();
});

test("ACC-19 revalidation keeps authenticated children mounted during recovery", async () => {
  let resolve!: (value: unknown) => void;
  api.mockResolvedValueOnce(user).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<AuthProvider><Consumer /></AuthProvider>);
  await screen.findByText("authenticated");
  fireEvent.click(screen.getByText("Reload"));
  expect(screen.getByText("authenticated")).toBeInTheDocument();
  expect(screen.getByText("hotel-1")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Reload"));
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => resolve(user));
});

test("ACC-06 successful logout clears identity even if an earlier reload finishes later", async () => {
  let resolve!: (value: unknown) => void;
  api.mockResolvedValueOnce(user).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce({ message: "Logged out" });
  // jsdom reports full-page navigation as unimplemented; the browser performs it.
  const navigationError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    render(<AuthProvider><Consumer /></AuthProvider>);
    await screen.findByText("authenticated");
    fireEvent.click(screen.getByText("Reload"));
    fireEvent.click(screen.getByText("Logout"));
    await screen.findByText("guest");
    await act(async () => resolve(user));
    expect(screen.queryByText("hotel-1")).not.toBeInTheDocument();
    expect(screen.getByText("guest")).toBeInTheDocument();
  } finally { navigationError.mockRestore(); }
});
