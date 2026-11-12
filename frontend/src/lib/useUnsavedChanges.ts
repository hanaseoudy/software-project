'use client';

import { useEffect } from 'react';

/**
 * Warns before the tab is closed or reloaded while a form has unsaved changes.
 * In-app Cancel/Back use <CancelButton>, which asks in the page instead.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);
}
