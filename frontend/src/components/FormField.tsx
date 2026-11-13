'use client';

import { useId } from 'react';

export interface FieldControlProps {
  id: string;
  name: string;
  required?: boolean;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

/**
 * GEN-15: every input has a visible label, says when it is optional, can show a
 * short hint (e.g. the expected format) and shows its error right under it.
 *
 *   <FormField label="Email" name="email" error={errors.email}>
 *     {(props) => <input {...props} type="email" className="input" />}
 *   </FormField>
 */
export function FormField({
  label,
  name,
  hint,
  error,
  required = false,
  count,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string | string[];
  required?: boolean;
  /** GEN-16: shows "12 / 500 characters" so users see the limit before they reach it. */
  count?: { value: string; max: number };
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const id = `${name}-${useId()}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorText = Array.isArray(error) ? error.join(' ') : error;
  const errorId = errorText ? `${id}-error` : undefined;
  const countId = count ? `${id}-count` : undefined;
  const describedBy = [hintId, countId, errorId].filter(Boolean).join(' ') || undefined;
  const near = count ? count.value.length >= count.max * 0.9 : false;

  return (
    <div className="field" data-invalid={errorText ? true : undefined}>
      <label htmlFor={id} className="field-label">
        {label}
        {!required && <span className="field-optional"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {children({
        id,
        name,
        required: required || undefined,
        'aria-invalid': errorText ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {count && (
        <p id={countId} className="field-count" data-near={near || undefined} aria-live={near ? 'polite' : 'off'}>
          {count.value.length} / {count.max} characters
        </p>
      )}
      {errorText && (
        <p id={errorId} className="field-error" role="alert">
          {errorText}
        </p>
      )}
    </div>
  );
}

/**
 * Moves the cursor to the first field with an error after a failed submit,
 * so the user can fix it straight away instead of searching the form.
 */
export function focusFirstError(form: HTMLFormElement | null) {
  const first = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  first?.focus();
}
