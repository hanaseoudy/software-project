'use client';

import { QuickActions } from '@/components/QuickActions';
import { SectionCards } from '@/components/SectionPage';
import { roleLabel } from '@/lib/labels';
import { groupsFor } from '@/lib/navigation';
import { useSession } from '@/lib/session';

export default function HomePage() {
  const { viewer } = useSession();
  // Every card shown here is a page the current viewer can use.
  const groups = groupsFor(viewer.audience);
  const staff = viewer.audience === 'admin' || viewer.audience === 'airline' || viewer.audience === 'hotel';

  return (
    <>
      <section className="hero">
        <h1>{staff ? `Welcome back${viewer.name ? `, ${viewer.name}` : ''}` : 'Plan your next trip'}</h1>
        <p className="muted">
          {staff
            ? `Signed in as ${roleLabel(viewer.audience)}. Your most-used tasks are below.`
            : 'Find flights and hotels, build day-by-day itineraries and share your travel stories.'}
        </p>
        <QuickActions />
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
