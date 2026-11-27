"use client";

// GEN-16 preview for the design-system page: loading, success and error feedback.
// It has its own <ToastProvider /> so the buttons work on this page without the layout.

import { ErrorState, LoadingState, Spinner, ToastCard, ToastProvider, useToast } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => toast.success("Saved")}>Show success toast</Button>
      <Button variant="neutral" onClick={() => toast.info("Your changes are being synced")}>
        Show info toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.error(new ApiError(409, "This room is no longer available."), {
            action: { label: "Try again", onClick: () => toast.success("Saved") },
          })
        }
      >
        Show error toast
      </Button>
    </div>
  );
}

export function FeedbackDemo() {
  return (
    <ToastProvider>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h3 className="text-xl">Toasts</h3>
          <ToastButtons />
          <div className="flex flex-col gap-3">
            <ToastCard kind="success" message="Saved" />
            <ToastCard kind="info" message="Your changes are being synced" />
            <ToastCard kind="error" message="Could not save. Please try again." action={{ label: "Try again", onClick: () => {} }} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xl">Loading</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Button disabled>
              <Spinner /> Saving
            </Button>
            <Spinner label="Searching flights" />
          </div>
          <LoadingState />
          <LoadingState variant="skeleton" rows={3} />
          <LoadingState variant="card" />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xl">Error with a way out</h3>
          <ErrorState
            error={new ApiError(404, "We couldn't find what you were looking for.")}
            title="Hotel not found"
            onRetry={() => {}}
            backHref="/design-system"
            backLabel="Back to hotels"
          />
        </div>
      </div>
    </ToastProvider>
  );
}
