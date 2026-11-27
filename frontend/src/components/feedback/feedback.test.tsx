import { act, fireEvent, render, screen } from "@testing-library/react";

import { ApiError } from "@/lib/api";

import { ErrorState, errorMessage } from "./error-state";
import { LoadingState } from "./loading-state";
import { Spinner } from "./spinner";
import { DEFAULT_DURATION, MAX_TOASTS, ToastProvider, useToast } from "./toast";

describe("Spinner / LoadingState (GEN-16)", () => {
  it("announces a labelled spinner", () => {
    render(<Spinner label="Searching flights" />);
    expect(screen.getByRole("status")).toHaveTextContent("Searching flights");
  });

  it("has no status role for a decorative spinner next to text", () => {
    render(<Spinner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a spinner with the default label", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows the requested number of skeleton rows and announces the label", () => {
    const { container } = render(<LoadingState variant="skeleton" rows={4} label="Loading hotels" />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("Loading hotels");
  });

  it("shows at least one skeleton row and a card skeleton", () => {
    const { container, rerender } = render(<LoadingState variant="skeleton" rows={0} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    rerender(<LoadingState variant="card" />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1);
  });
});

describe("ErrorState (GEN-16)", () => {
  it("shows the backend message of an ApiError and a title chosen from the status", () => {
    render(<ErrorState error={new ApiError(404, "Hotel not found.")} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
    expect(screen.getByText("Hotel not found.")).toBeInTheDocument();
  });

  it("chooses the title for network, permission and server errors", () => {
    const { rerender } = render(<ErrorState error={new ApiError(0, "offline")} />);
    expect(screen.getByRole("heading", { name: "No connection" })).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(403, "no")} />);
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(500, "boom")} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(409, "Conflict")} />);
    expect(screen.getByRole("heading", { name: "We couldn't do that" })).toBeInTheDocument();
  });

  it("never shows the text of a non-API error", () => {
    render(<ErrorState error={new TypeError("Failed to fetch https://internal")} />);
    expect(screen.queryByText(/internal/)).not.toBeInTheDocument();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(errorMessage("x")).toBe("Something went wrong. Please try again.");
  });

  it("lets the page override the title and message", () => {
    render(<ErrorState error={new ApiError(404, "x")} title="Hotel not found" message="It may have been removed." />);
    expect(screen.getByRole("heading", { name: "Hotel not found" })).toBeInTheDocument();
    expect(screen.getByText("It may have been removed.")).toBeInTheDocument();
  });

  it("offers Try again only when there is something to retry", () => {
    const { rerender } = render(<ErrorState error={new ApiError(500, "x")} />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(500, "x")} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("disables Try again while the retry is running, then enables it again", async () => {
    let finish: () => void = () => {};
    const onRetry = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<ErrorState error={new ApiError(500, "x")} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(button).toBeEnabled();
  });

  it("links back to a page, or goes back in history, or hides the button", () => {
    const { rerender } = render(<ErrorState backHref="/hotels" backLabel="Back to hotels" />);
    expect(screen.getByRole("link", { name: "Back to hotels" })).toHaveAttribute("href", "/hotels");

    const back = jest.spyOn(window.history, "back").mockImplementation(() => {});
    rerender(<ErrorState />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();

    rerender(<ErrorState hideBack />);
    expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
  });
});

function Buttons({ onAction }: { onAction?: () => void }) {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Saved")}>success</button>
      <button onClick={() => toast.info("Heads up")}>info</button>
      <button onClick={() => toast.error(new ApiError(409, "Room taken."))}>api error</button>
      <button onClick={() => toast.error("Could not save", { action: { label: "Retry", onClick: () => onAction?.() } })}>
        retry error
      </button>
      <button onClick={() => toast.success("Sticky", { duration: 0 })}>sticky</button>
    </>
  );
}

describe("Toasts (GEN-16)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

  it("shows a success toast and closes it after 4 seconds", () => {
    render(<ToastProvider><Buttons /></ToastProvider>);
    click("success");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => jest.advanceTimersByTime(DEFAULT_DURATION.success - 1));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("shows errors as alerts for 8 seconds, with the backend message of an ApiError", () => {
    render(<ToastProvider><Buttons /></ToastProvider>);
    click("api error");
    expect(screen.getByRole("alert")).toHaveTextContent("Room taken.");
    act(() => jest.advanceTimersByTime(DEFAULT_DURATION.success));
    expect(screen.getByText("Room taken.")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(DEFAULT_DURATION.error));
    expect(screen.queryByText("Room taken.")).not.toBeInTheDocument();
  });

  it("closes a toast with its Close button", () => {
    render(<ToastProvider><Buttons /></ToastProvider>);
    click("info");
    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
  });

  it("keeps a toast with duration 0 until it is closed", () => {
    render(<ToastProvider><Buttons /></ToastProvider>);
    click("sticky");
    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByText("Sticky")).toBeInTheDocument();
  });

  it("runs the recovery action and closes the toast", () => {
    const onAction = jest.fn();
    render(<ToastProvider><Buttons onAction={onAction} /></ToastProvider>);
    click("retry error");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Could not save")).not.toBeInTheDocument();
  });

  it("shows at most four toasts, newest last", () => {
    render(<ToastProvider><Buttons /></ToastProvider>);
    for (let i = 0; i < MAX_TOASTS + 2; i++) click("success");
    expect(screen.getAllByText("Saved")).toHaveLength(MAX_TOASTS);
  });

  it("throws a clear error outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Buttons />)).toThrow("useToast must be used inside <ToastProvider>.");
    spy.mockRestore();
  });
});
