'use client';

import { useEffect, useState } from 'react';

/** GEN-16: tells the user when the connection drops, and when it is back, so failed actions make sense. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const goOffline = () => {
      setOffline(true);
      setBackOnline(false);
    };
    const goOnline = () => {
      setOffline(false);
      setBackOnline(true);
      timer = setTimeout(() => setBackOnline(false), 4000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearTimeout(timer);
    };
  }, []);

  if (!offline && !backOnline) return null;
  return (
    <div className={`connection-banner ${offline ? 'is-offline' : 'is-online'}`} role="status">
      {offline
        ? 'You’re offline. Changes can’t be saved until your connection is back.'
        : 'You’re back online.'}
    </div>
  );
}
