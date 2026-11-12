'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Audience } from './navigation';

export interface Viewer {
  audience: Audience;
  name?: string;
}

interface SessionState {
  viewer: Viewer;
  loading: boolean;
  /** True once the user has moved to another page in this tab, so "Back" can use history. */
  hasInAppHistory: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const GUEST: Viewer = { audience: 'guest' };

const SessionContext = createContext<SessionState | null>(null);

interface MeResponse {
  firstName: string;
  role: 'user' | 'moderator' | 'admin';
  providerType: 'hotel' | 'airline' | null;
}

function toAudience(me: MeResponse): Audience {
  if (me.role === 'admin') return 'admin';
  if (me.role === 'moderator') return me.providerType === 'hotel' ? 'hotel' : 'airline';
  return 'user';
}

/**
 * Who is viewing, read from GET /api/auth/me. Auth stays in httpOnly cookies (ACC-19);
 * nothing is stored in browser storage. Only used to choose which menus to show:
 * the backend still enforces every permission (GEN-13).
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<Viewer>(GUEST);
  const [loading, setLoading] = useState(true);
  const [hasInAppHistory, setHasInAppHistory] = useState(false);
  const pathname = usePathname();
  const firstPath = useRef(pathname);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        setViewer(GUEST);
        return;
      }
      const me = (await res.json()) as MeResponse;
      setViewer({ audience: toAudience(me), name: me.firstName });
    } catch {
      setViewer(GUEST);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setViewer(GUEST);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (pathname !== firstPath.current) setHasInAppHistory(true);
  }, [pathname]);

  return (
    <SessionContext.Provider value={{ viewer, loading, hasInAppHistory, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
