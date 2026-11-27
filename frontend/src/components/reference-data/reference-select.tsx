"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// The select behind every reference-data picker (GEN-12): a labelled, accessible
// <select> in the Neobrutalism style, with loading, error ("Try again") and field-error
// states. Pages use AirportPicker, CountryPicker, CityPicker or CurrencyPicker instead.

export interface SelectOption {
  value: string;
  label: string;
}

export interface ReferenceSelectProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  /** Loading failed: shows a message with "Try again". */
  loadError?: unknown;
  onRetry?: () => void;
  /** Backend validation message(s) for this field (GEN-02). */
  error?: string | string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

const LOAD_FAILED = "We couldn't load this list.";

export function ReferenceSelect({
  label,
  options,
  value,
  onChange,
  isLoading = false,
  loadError,
  onRetry,
  error,
  placeholder = "Select…",
  required,
  disabled,
  id,
  name,
  className,
}: ReferenceSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const fieldError = Array.isArray(error) ? error.join(" ") : error;
  const failed = loadError !== undefined && loadError !== null;
  const noOptions = !isLoading && !failed && options.length === 0;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <Label htmlFor={selectId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      <div className="relative">
        <select
          id={selectId}
          name={name}
          value={value}
          required={required}
          disabled={disabled || isLoading || failed}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
          aria-busy={isLoading || undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-10 w-full appearance-none rounded-base border-2 bg-secondary-background py-2 pr-9 pl-3 text-sm font-base text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            fieldError ? "border-main" : "border-border",
          )}
        >
          <option value="">{isLoading ? "Loading…" : placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
      </div>
      {failed && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{isApiError(loadError) ? loadError.message : LOAD_FAILED}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-heading underline underline-offset-2">
              Try again
            </button>
          )}
        </p>
      )}
      {noOptions && <p className="text-sm">Nothing to choose from yet.</p>}
      {fieldError && (
        <p id={errorId} role="alert" className="text-sm font-heading text-main">
          {fieldError}
        </p>
      )}
    </div>
  );
}
