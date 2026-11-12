'use client';

import { SectionCards } from '@/components/SectionPage';
import { groupsFor } from '@/lib/navigation';
import { useSession } from '@/lib/session';

export default function HomePage() {
  const { viewer } = useSession();
  // Every card shown here is a page the current viewer can use.
  const groups = groupsFor(viewer.audience);

  return (
    <>
      <section className="hero">
        <h1>Plan your next trip</h1>
        <p className="muted">Find flights and hotels, build day-by-day itineraries and share your travel stories.</p>
      </section>
      {groups.map((group) => (
        <section key={group.id} className="section" aria-labelledby={`home-${group.id}`}>
          <h2 id={`home-${group.id}`}>{group.label}</h2>
          <SectionCards items={group.items} />
        </section>
      ))}
    </>
  );
}
