import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SessionProvider } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Travel Planner', template: '%s · Travel Planner' },
  description: 'Plan trips, book flights and hotels, and share travel stories.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SessionProvider>
          <SiteHeader />
          <main id="main" className="container page">
            {children}
          </main>
          <footer className="site-footer">
            <div className="container footer-row">
              <span className="muted">Travel Planner</span>
              <nav aria-label="Footer" className="footer-links">
                <Link href="/flights">Flights</Link>
                <Link href="/hotels">Hotels</Link>
                <Link href="/itineraries">Itineraries</Link>
                <Link href="/blog">Blog</Link>
              </nav>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
