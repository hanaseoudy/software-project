import * as React from "react"

import { cn } from "@/lib/utils"

// Placeholder block shown while content loads (GEN-16). Decorative, so it is hidden
// from screen readers; the surrounding <LoadingState /> announces "Loading".
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-base border-2 border-border bg-secondary-background motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
