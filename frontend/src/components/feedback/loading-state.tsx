import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { Spinner } from "./spinner";

// GEN-16 / GEN-04: loading state for a page or a section.
//
//   if (isLoading) return <LoadingState />;                          // spinner + "Loading…"
//   if (isLoading) return <LoadingState variant="skeleton" rows={5} />;  // list or table placeholder
//   if (isLoading) return <LoadingState variant="card" />;           // a card-shaped placeholder
//
// Use `skeleton` / `card` when the shape of the content is known (it avoids layout
// jumps), and the spinner for short or unpredictable waits.

export interface LoadingStateProps {
  variant?: "spinner" | "skeleton" | "card";
  /** Text announced to screen readers (and shown next to the spinner). Defaults to "Loading…". */
  label?: string;
  /** Number of placeholder rows for the `skeleton` variant. Defaults to 3. */
  rows?: number;
  className?: string;
}

export function LoadingState({ variant = "spinner", label = "Loading…", rows = 3, className }: LoadingStateProps) {
  if (variant === "spinner") {
    return (
      <div role="status" aria-busy="true" className={cn("flex items-center justify-center gap-3 p-8", className)}>
        <Spinner className="size-6" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div role="status" aria-busy="true" className={cn("flex w-full flex-col gap-3", className)}>
      <span className="sr-only">{label}</span>
      {variant === "card" ? (
        <div className="flex flex-col gap-4 rounded-base border-2 border-border bg-background p-4 shadow-shadow">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-32" />
        </div>
      ) : (
        Array.from({ length: Math.max(1, rows) }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)
      )}
    </div>
  );
}
