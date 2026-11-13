'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { CancelButton } from '@/components/CancelButton';
import { FormField, focusFirstError } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatMoney, plural } from '@/lib/format';

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

      <section className="section">
        <h2>Buttons</h2>
        <div className="row">
          <Button>Book now</Button>
          <Button variant="secondary">Save as draft</Button>
          <Button variant="danger">Cancel booking</Button>
          <Button busy busyLabel="Booking…">Book now</Button>
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
