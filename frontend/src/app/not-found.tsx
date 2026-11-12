import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="button button-primary">
        Go to home page
      </Link>
    </div>
  );
}
