'use client';

import './globals.css';

/** GEN-16: last-resort screen if the whole layout fails; still offers a way to recover. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="container page">
          <div className="error-state" role="alert">
            <h1>Something went wrong</h1>
            <p>The site couldn’t load. Please try again.</p>
            <div className="row row-center">
              <button type="button" className="button button-primary" onClick={reset}>
                Try again
              </button>
              {/* Plain link on purpose: a full reload recovers even if the app itself failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="button button-ghost">
                Go to home page
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
