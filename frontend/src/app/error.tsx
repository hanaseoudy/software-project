"use client";

// GEN-16: the error page of every route that has no error page of its own.
// An unexpected error while a page renders shows the shared error state with "Try again".

import { ErrorState } from "@/components/feedback";

export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-10">
      <ErrorState title="Something went wrong" message="Something went wrong on our side. Please try again." onRetry={retry} backHref="/" backLabel="Home" />
    </main>
  );
}
