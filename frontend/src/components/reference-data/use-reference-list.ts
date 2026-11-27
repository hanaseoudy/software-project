"use client";

import { useCallback, useEffect, useState } from "react";

export interface ReferenceList<T> {
  items: T[];
  isLoading: boolean;
  /** The thrown value when loading failed. */
  error: unknown;
  /** Loads again (the loader is expected to ask the backend again). */
  reload: () => void;
}

/** Loads a reference list once per `key` change and exposes loading, error and reload. */
export function useReferenceList<T>(key: string, load: () => Promise<T[]>, onReload?: () => void): ReferenceList<T> {
  const [state, setState] = useState<{ key: string; items: T[]; error: unknown; done: boolean }>({
    key,
    items: [],
    error: undefined,
    done: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (items) => !cancelled && setState({ key, items, error: undefined, done: true }),
      (error: unknown) => !cancelled && setState({ key, items: [], error, done: true }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is a new function on every render; the key identifies what is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => {
    onReload?.();
    setState((current) => ({ ...current, done: false, error: undefined }));
    setAttempt((n) => n + 1);
  }, [onReload]);

  // A new key shows the loading state at once, without keeping the old key's options.
  const current = state.key === key;
  return {
    items: current ? state.items : [],
    isLoading: !current || !state.done,
    error: current ? state.error : undefined,
    reload,
  };
}
