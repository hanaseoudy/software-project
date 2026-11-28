import { hasRole, homeFor, loginHref, safeReturnTo } from "./navigation";
import type { CurrentUser } from "./types";

const user: CurrentUser = { id: "1", firstName: "Test", lastName: "User", email: "test@example.test", role: "user", providerId: null, providerType: null, emailVerified: true, mustChangePassword: false };

test.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%2fevil.test", "/%5cevil.test", "/%0aevil", "/login", "/api/auth/logout", "/%", "/a/../login", "/a/..//evil.test", "/%61pi/auth/logout"])("ACC-10 rejects unsafe or looping destination %s", value => {
  expect(safeReturnTo(value, "/hotel")).toBe("/hotel");
});
test("ACC-10 preserves a local action, query and fragment", () => {
  expect(safeReturnTo("/hotels/123/book?rooms=1#guests")).toBe("/hotels/123/book?rooms=1#guests");
  window.history.replaceState(null, "", "/flights/book?flight=123");
  const params = new URL(loginHref(true), window.location.origin).searchParams;
  expect(params.get("returnTo")).toBe("/flights/book?flight=123");
  expect(params.get("reason")).toBe("session-expired");
});
test("ACC-04 routes all roles to their own home", () => {
  expect(homeFor(user)).toBe("/");
  expect(homeFor({ ...user, role: "admin" })).toBe("/admin/system");
  expect(homeFor({ ...user, role: "moderator", providerType: "airline", providerId: "a" })).toBe("/airline");
  expect(homeFor({ ...user, role: "moderator", providerType: "hotel", providerId: "h" })).toBe("/hotel");
});
test("ACC-11 distinguishes moderator assignment and does not grant admin access to user routes", () => {
  expect(hasRole({ ...user, role: "admin" }, "user")).toBe(false);
  expect(hasRole({ ...user, role: "moderator", providerType: "hotel", providerId: "h" }, "airline")).toBe(false);
  expect(hasRole({ ...user, role: "moderator", providerType: "hotel" }, "hotel")).toBe(false);
});
