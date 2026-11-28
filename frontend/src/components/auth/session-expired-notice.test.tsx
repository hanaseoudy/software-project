import { render, screen } from "@testing-library/react";
import { SessionExpiredNotice } from "./session-expired-notice";
let path = "/login";
let query = "reason=session-expired";
jest.mock("next/navigation", () => ({ usePathname: () => path, useSearchParams: () => new URLSearchParams(query) }));
test("ACC-06 explains session expiry on login only", () => {
  const view = render(<SessionExpiredNotice />);
  expect(screen.getByRole("status")).toHaveTextContent("Your session expired, please log in again.");
  path = "/register";
  view.rerender(<SessionExpiredNotice />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  path = "/login"; query = "";
  view.rerender(<SessionExpiredNotice />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
