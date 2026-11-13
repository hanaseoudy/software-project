import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UiKit } from './UiKit';

export const metadata: Metadata = { title: 'UI kit' };

/**
 * Developer reference for the shared components (GEN-14, GEN-15).
 * Only available with `npm run dev`; production builds return 404.
 */
export default function UiKitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <UiKit />;
}
