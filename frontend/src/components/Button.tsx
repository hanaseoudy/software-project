import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'button-primary',
  secondary: 'button-ghost',
  danger: 'button-danger',
};

/**
 * GEN-15: one clearly visible main action per screen (`primary`), quieter secondary
 * actions, and red only for destructive ones. While `busy`, the button shows what is
 * happening and can't be pressed twice (no duplicate bookings or posts).
 */
export function Button({
  variant = 'primary',
  busy = false,
  busyLabel = 'Please wait…',
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  busyLabel?: string;
}) {
  return (
    <button
      {...rest}
      type={type}
      className={['button', VARIANT_CLASS[variant], className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
