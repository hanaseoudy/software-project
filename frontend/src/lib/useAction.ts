'use client';

import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/components/Toaster';
import { ApiError, errorMessage } from './api';

interface Options<R> {
  /** Shown as a success message when the action finishes (string or built from the result). */
  success?: string | ((result: R) => string);
  /** Skip the error message toast (e.g. when the page shows the error itself). */
  silentError?: boolean;
}

/**
 * GEN-16: runs a user action (save, book, delete…) and gives feedback for every state:
 * `busy` while it runs (pass to <Button busy>), a success message when done, and on
 * failure either per-field messages (GEN-02, for <FormField error>) or an understandable
 * error with "Try again" when retrying can help.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, options: Options<R> = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const running = useRef(false);
  const latest = useRef({ fn, options });
  latest.current = { fn, options };

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (running.current) return undefined; // ignore double clicks
      running.current = true;
      setBusy(true);
      setError(null);
      setFieldErrors({});
      try {
        const result = await latest.current.fn(...args);
        const { success } = latest.current.options;
        if (success) toast.success(typeof success === 'function' ? success(result) : success);
        return result;
      } catch (e) {
        const message = errorMessage(e);
        setError(message);
        if (e instanceof ApiError && e.hasFieldErrors) setFieldErrors(e.fieldErrors);
        if (!latest.current.options.silentError) {
          const retry = e instanceof ApiError && e.retryable ? { label: 'Try again', onClick: () => void run(...args) } : undefined;
          toast.error(message, retry);
        }
        return undefined;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [toast],
  );

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((errs) => {
      if (!(field in errs)) return errs;
      const next = { ...errs };
      delete next[field];
      return next;
    });
  }, []);

  return { run, busy, error, fieldErrors, clearFieldError };
}
