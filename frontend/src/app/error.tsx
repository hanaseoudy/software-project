'use client';

import { ErrorState } from '@/components/ErrorState';

/** GEN-16: if a page crashes, show a friendly message with "Try again" instead of a blank screen. */
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      message="This page ran into a problem. Your other pages and your login are not affected. Try again, or go back to the home page."
      onRetry={reset}
    />
  );
}
