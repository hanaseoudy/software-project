'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { CancelButton } from '@/components/CancelButton';
import { FormField, focusFirstError } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatMoney, plural } from '@/lib/format';

const COLOR_TOKENS = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-soft',
  '--color-text',
  '--color-text-secondary',
  '--color-muted',
  '--color-border',
  '--color-bg',
  '--color-surface',
  '--color-success',
  '--color-success-soft',
  '--color-warning-text',
  '--color-warning-soft',
  '--color-danger',
  '--color-danger-soft',
];
const TYPE_SCALE = ['--text-3xl', '--text-2xl', '--text-xl', '--text-lg', '--text-base', '--text-sm', '--text-xs'];
const SPACING = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7'];

/** GEN-17: the design system every page uses. */
function DesignTokens() {
  return (
    <section className="section" aria-labelledby="tokens">
      <h2 id="tokens">Design system</h2>
      <p className="muted">Use only these colours, sizes and spacings (defined in globals.css).</p>
      <h3>Colours</h3>
      <ul className="swatch-grid">
        {COLOR_TOKENS.map((t) => (
          <li key={t} className="swatch">
            <div className="swatch-color" style={{ background: `var(${t})` }} />
            <span className="swatch-name">
              <code>{t}</code>
            </span>
          </li>
        ))}
      </ul>
      <h3>Text sizes</h3>
      <div className="card type-scale">
        {TYPE_SCALE.map((t) => (
          <p key={t} style={{ fontSize: `var(${t})` }}>
            {t.replace('--text-', '')}: Plan your next trip
          </p>
        ))}
      </div>
      <h3>Spacing</h3>
      <div className="card">
        {SPACING.map((t) => (
          <div key={t} className="row">
            <code className="muted">{t}</code>
            <div className="space-bar" style={{ width: `var(${t})` }} />
          </div>
        ))}
      </div>
    </section>
  );
}

const BOOKINGS = [
  { ref: 'FB-20391', type: 'Flight', provider: 'Nile Air', date: '2026-12-04T08:30:00Z', amount: 420, status: 'CONFIRMED' },
  { ref: 'HR-11802', type: 'Hotel', provider: 'Cairo View Hotel', date: '2026-12-10T12:00:00Z', amount: 1500.5, status: 'PENDING_PAYMENT' },
  { ref: 'FB-19877', type: 'Flight', provider: 'Sky Wings', date: '2026-10-02T17:15:00Z', amount: 310, status: 'CANCELLED' },
];

const STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'partially_refunded', 'draft'];

type Form = { title: string; email: string; notes: string };
const EMPTY: Form = { title: '', email: '', notes: '' };

export function UiKit() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
    setSaved(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.title.trim()) next.title = 'Enter a title.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter an email address like name@example.com.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => focusFirstError(formRef.current));
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setForm(EMPTY);
  }

  return (
    <>
      <PageHeader
        title="UI kit"
        description="Shared building blocks. Use these so every page looks and behaves the same."
        showBack
        actions={<Button onClick={() => window.scrollTo({ top: 0 })}>Primary action</Button>}
      />

      <DesignTokens />

      <section className="section">
        <h2>Buttons</h2>
        <div className="row">
          <Button>Book now</Button>
          <Button variant="secondary">Save as draft</Button>
          <Button variant="danger">Cancel booking</Button>
          <Button busy busyLabel="Booking…">Book now</Button>
          <Button disabled>Not available</Button>
        </div>
      </section>

      <section className="section">
        <h2>Status labels</h2>
        <div className="row">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Table</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Type</th>
                <th scope="col">Provider</th>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {BOOKINGS.map((b) => (
                <tr key={b.ref}>
                  <td>{b.ref}</td>
                  <td>{b.type}</td>
                  <td>{b.provider}</td>
                  <td>{formatDateTime(b.date, 'Africa/Cairo')}</td>
                  <td className="num">{formatMoney(b.amount)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Money and dates</h2>
        <p>
          {formatMoney(1500.5)} · {formatDateTime('2026-11-13T12:05:00Z', 'Africa/Cairo')} (Cairo time) ·{' '}
          {plural(3, 'night')}
        </p>
      </section>

      <section className="section">
        <h2>Form</h2>
        <form ref={formRef} className="card form" onSubmit={submit} noValidate>
          <FormField label="Title" name="title" required error={errors.title}>
            {(p) => <input {...p} className="input" value={form.title} onChange={set('title')} />}
          </FormField>
          <FormField label="Email" name="email" required hint="We send the confirmation here." error={errors.email}>
            {(p) => <input {...p} type="email" className="input" value={form.email} onChange={set('email')} />}
          </FormField>
          <FormField label="Notes" name="notes" hint="Up to 500 characters.">
            {(p) => <textarea {...p} className="input" rows={3} maxLength={500} value={form.notes} onChange={set('notes')} />}
          </FormField>
          <div className="field-row">
            <FormField label="Cabin" name="cabin">
              {(p) => (
                <select {...p} className="input" defaultValue="economy">
                  <option value="economy">Economy</option>
                  <option value="premium">Premium Economy</option>
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              )}
            </FormField>
            <FormField label="Currency" name="currency" hint="Prices use the platform currency.">
              {(p) => <input {...p} className="input" value="USD" disabled readOnly />}
            </FormField>
          </div>
          <fieldset className="field">
            <legend className="field-label">Trip type</legend>
            <div className="row">
              <label className="checkbox">
                <input type="radio" name="trip" defaultChecked /> One-way
              </label>
              <label className="checkbox">
                <input type="radio" name="trip" /> Round-trip
              </label>
              <label className="checkbox">
                <input type="radio" name="trip" /> Multi-city
              </label>
            </div>
          </fieldset>
          {saved && (
            <p className="notice notice-success" role="status">
              Saved.
            </p>
          )}
          <div className="form-actions">
            <CancelButton isDirty={isDirty} fallbackHref="/" />
            <Button type="submit" busy={saving} busyLabel="Saving…">
              Save
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
