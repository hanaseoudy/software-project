"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { errorMessage } from "./error-state";

// GEN-16: success, error and info toasts ("Saved", "Could not save").
// <ToastProvider /> is mounted once in the root layout; any client component can then:
//
//   const toast = useToast();
//   toast.success("Saved");
//   toast.error(error);                                       // an ApiError shows the backend message
//   toast.error(error, { action: { label: "Retry", onClick: save } });   // recovery option
//
// Success and info toasts close after 4 seconds, errors after 8 (or the user closes them).
// Errors are announced at once to screen readers (role="alert"), the others politely.

export type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Milliseconds before it closes on its own. 0 keeps it until the user closes it. */
  duration?: number;
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  /** A string, or any thrown value: an ApiError shows its message, anything else a generic one. */
  error: (messageOrError: unknown, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

export const DEFAULT_DURATION: Record<ToastKind, number> = { success: 4000, info: 4000, error: 8000 };
export const MAX_TOASTS = 4;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>.");
  return api;
}

const STYLES: Record<ToastKind, { icon: typeof Info; badge: string }> = {
  success: { icon: CircleCheck, badge: "bg-olive text-main-foreground" },
  error: { icon: CircleAlert, badge: "bg-main text-main-foreground" },
  info: { icon: Info, badge: "bg-mustard text-foreground" },
};

/** One toast, without any timer. Also used by the design-system page. */
export function ToastCard({
  kind,
  message,
  action,
  onClose,
}: {
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  onClose?: () => void;
}) {
  const { icon: Icon, badge } = STYLES[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-base border-2 border-border bg-background p-3 text-foreground shadow-shadow"
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border", badge)}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="break-words text-sm">{message}</p>
        {action && (
          <button type="button" onClick={action.onClick} className="text-sm font-heading underline underline-offset-2">
            {action.label}
          </button>
        )}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close notification" className="shrink-0 rounded-base p-0.5">
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((current) => {
        const next = [...current, { id, kind, message, ...options }];
        // Keep the newest toasts; the timers of dropped ones are cleaned up below.
        return next.slice(-MAX_TOASTS);
      });
      const duration = options.duration ?? DEFAULT_DURATION[kind];
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => clearTimeout(timer));
      active.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => show("success", message, options),
      error: (messageOrError, options) =>
        show("error", typeof messageOrError === "string" ? messageOrError : errorMessage(messageOrError), options),
      info: (message, options) => show("info", message, options),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-3 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            kind={toast.kind}
            message={toast.message}
            action={
              toast.action && {
                label: toast.action.label,
                onClick: () => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                },
              }
            }
            onClose={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
