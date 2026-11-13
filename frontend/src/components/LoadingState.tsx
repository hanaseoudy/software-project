/** GEN-16: shown while a page or list is loading, so users know something is happening. */
export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <p className="loading-label">
        <span className="spinner" aria-hidden="true" />
        {label}
      </p>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    </div>
  );
}
