import Link from "next/link";

import { Button } from "@/components/ui/button";

// Placeholder home page. The real home page and navbar come in later tasks (FND-2 and feature tasks).
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl sm:text-5xl">Travel Planner</h1>
      <p className="text-lg">
        Plan trips, book flights and hotels, and keep your travel budget in one place.
      </p>
      <Button render={<Link href="/design-system" />} nativeButton={false}>
        View the design system
      </Button>
    </main>
  );
}
