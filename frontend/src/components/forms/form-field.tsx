"use client";

import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface FormFieldControlProps {
  id: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

export interface FormFieldProps {
  /** Exact backend field key, including dotted paths such as days.0.city. */
  name: string;
  label: ReactNode;
  /** apiFetch's ApiError.fieldErrors, or the errors map from a validated response. */
  errors?: FieldErrors;
  hint?: ReactNode;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** Additional description IDs to preserve alongside the hint and errors. */
  describedBy?: string;
  className?: string;
  /** Spread these attributes onto the actual focusable control. */
  children: (props: FormFieldControlProps) => ReactNode;
}

/** GEN-02/GEN-16: presentation only; the owning form manages values and errors. */
export function FormField({
  name, label, errors, hint, id, required, disabled, describedBy, className, children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-errors`;
  const messages = errors && Object.hasOwn(errors, name)
    ? errors[name].filter(message => message.trim().length > 0)
    : [];
  const hasHint = hint !== undefined && hint !== null && hint !== false && hint !== "";
  const description = [describedBy, hasHint ? hintId : undefined, messages.length ? errorId : undefined]
    .filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={controlId}>
        {label}{required && <span className="font-base"> (required)</span>}
      </Label>
      {hasHint && <p id={hintId} className="text-sm text-foreground [overflow-wrap:anywhere]">{hint}</p>}
      {children({ id: controlId, name, required, disabled, "aria-invalid": messages.length ? true : undefined, "aria-describedby": description })}
      {messages.length > 0 && (
        <ul id={errorId} role="alert" className="flex flex-col gap-1 text-sm font-heading text-main [overflow-wrap:anywhere]">
          {messages.map((message, index) => <li key={index}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}
