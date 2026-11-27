import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

// GEN-16: small spinner for buttons and inline waits.
//
//   <Button disabled={pending}>{pending && <Spinner />} Save</Button>   // decorative inside a button
//   <Spinner label="Searching flights" />                               // announced to screen readers

export interface SpinnerProps {
  /** Announced to screen readers. Leave out when the spinner sits next to visible text. */
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: SpinnerProps) {
  const icon = <LoaderCircle aria-hidden="true" className={cn("size-4 animate-spin motion-reduce:animate-none", className)} />;
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
