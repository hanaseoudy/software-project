import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionPage } from '@/components/SectionPage';
import { allRoutes, routeInfo } from '@/lib/navigation';

// Only the routes defined in the site map exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return allRoutes().map((href) => ({ slug: href.split('/').filter(Boolean) }));
}

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: routeInfo(`/${slug.join('/')}`)?.label };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const path = `/${slug.join('/')}`;
  if (!routeInfo(path)) notFound();
  return <SectionPage path={path} />;
}
