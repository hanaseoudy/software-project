import Link from 'next/link';
import { Button } from './Button';

/**
 * GEN-16: shown when a page or list fails to load. Says what went wrong in plain
 * words and offers a way out: try again, or go somewhere safe.
 */
export function ErrorState({
  title = 'This couldn’t be loaded',
  message,
  onRetry,
  retrying = false,
  homeHref = '/',
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  homeHref?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="row row-center">
        {onRetry && (
          <Button onClick={onRetry} busy={retrying} busyLabel="Trying again…">
            Try again
          </Button>
        )}
        <Link href={homeHref} className="button button-ghost">
          Go to home page
        </Link>
      </div>
    </div>
  );
}
