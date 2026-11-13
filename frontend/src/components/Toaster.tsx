'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type Kind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: Kind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: string) => void;
  info: (message: string) => void;
  /** Errors stay until dismissed; pass `action` to offer a way out (e.g. "Try again"). */
  error: (message: string, action?: Toast['action']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const AUTO_HIDE_MS = 5000;

/**
 * GEN-16: short messages after an action ("Saved", "Couldn't save – Try again").
 * Success/info hide after 5 s; errors stay so the user can read them and recover.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: Kind, message: string, action?: Toast['action']) => {
      const id = nextId.current++;
      // Same message twice in a row: keep one instead of stacking duplicates.
      setToasts((list) => [...list.filter((t) => t.message !== message), { id, kind, message, action }].slice(-4));
      if (kind !== 'error') setTimeout(() => dismiss(id), AUTO_HIDE_MS);
    },
    [dismiss],
  );

  const api = useRef<ToastApi>({
    success: (m) => push('success', m),
    info: (m) => push('info', m),
    error: (m, a) => push('error', m, a),
  });

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon" aria-hidden="true">
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}
            </span>
            <p className="toast-message">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
