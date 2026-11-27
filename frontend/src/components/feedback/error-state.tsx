"use client";

import { CircleAlert, RotateCw, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { isApiError, NETWORK_ERROR_STATUS } from "@/lib/api";
import { cn } from "@/lib/utils";

import { Spinner } from "./spinner";

// GEN-16: an error message with a way out ("Try again", "Go back").
//
//   if (error) return <ErrorState error={error} onRetry={refetch} backHref="/hotels" />;
//   <ErrorState title="Hotel not found" error={error} backHref="/hotels" backLabel="Back to hotels" />
//
// The text comes from the backend's message when `error` is an ApiError (see
// lib/api/errors.ts). Any other error shows a generic message, so a raw
// "TypeError: Failed to fetch" is never put in front of a user. `onRetry` may
// return a promise: the button shows a spinner until it settles.

export interface ErrorStateProps {
  /** The thrown value. An ApiError gives the title and message; anything else gets generic text. */
  error?: unknown;
  /** Overrides the title chosen from the error status. */
  title?: string;
  /** Overrides the message taken from the error. */
  message?: string;
  /** Shows "Try again". May return a promise. */
  onRetry?: () => void | Promise<unknown>;
  retryLabel?: string;
  /** Shows a "Go back" link to this page. Without it, "Go back" returns to the previous page. */
  backHref?: string;
  backLabel?: string;
  /** Hide "Go back" (for example when the error is already shown on the only page there is). */
  hideBack?: boolean;
  className?: string;
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

function titleFor(error: unknown): string {
  if (!isApiError(error)) return "Something went wrong";
  if (error.status === NETWORK_ERROR_STATUS) return "No connection";
  if (error.status === 401) return "Please log in";
  if (error.status === 403) return "No access";
  if (error.status === 404) return "Not found";
  if (error.status >= 500) return "Something went wrong";
  return "We couldn't do that";
}

/** The message that is safe to show: only an ApiError's message, otherwise a generic one. */
export function errorMessage(error: unknown): string {
  return isApiError(error) ? error.message : GENERIC_MESSAGE;
}

export function ErrorState({
  error,
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  backHref,
  backLabel = "Go back",
  hideBack = false,
  className,
}: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-base border-2 border-border bg-background p-6 text-center shadow-shadow",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full border-2 border-border bg-terracotta text-foreground">
        <CircleAlert aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-2xl">{title ?? titleFor(error)}</h2>
      <p>{message ?? errorMessage(error)}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <Button onClick={handleRetry} disabled={retrying}>
            {retrying ? <Spinner /> : <RotateCw aria-hidden="true" />}
            {retryLabel}
          </Button>
        )}
        {!hideBack &&
          (backHref ? (
            <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
              <ArrowLeft aria-hidden="true" />
              {backLabel}
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => window.history.back()}>
              <ArrowLeft aria-hidden="true" />
              {backLabel}
            </Button>
          ))}
      </div>
    </div>
  );
}
