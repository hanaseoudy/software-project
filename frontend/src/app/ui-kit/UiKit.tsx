'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { CancelButton } from '@/components/CancelButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { FormField, focusFirstError } from '@/components/FormField';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toaster';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDateTime, formatMoney, plural } from '@/lib/format';
import { useAction } from '@/lib/useAction';

const STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'partially_refunded', 'draft'];
const BOOKINGS = [
  { ref: 'FB-20391', type: 'Flight', provider: 'Nile Air', date: '2026-12-04T08:30:00Z', amount: 420, status: 'CONFIRMED' },
  { ref: 'HB-11872', type: 'Hotel', provider: 'Sea View Hotel', date: '2026-12-05T12:00:00Z', amount: 690.5, status: 'PENDING_PAYMENT' },
  { ref: 'FB-19004', type: 'Flight', provider: 'Delta Wings', date: '2026-10-02T21:10:00Z', amount: 310, status: 'CANCELLED' },
];

type Form = { title: string; email: string; checkIn: string; checkOut: string; guests: string; notes: string };
const EMPTY: Form = { title: '', email: '', checkIn: '', checkOut: '', guests: '1', notes: '' };
const today = () => new Date().toISOString().slice(0, 10);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Crash(): never {
  throw new Error('Demo crash');
}

/** Loads the current user from the real backend to show loading, success and error states. */
function ServerDemo() {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; text: string }>({ status: 'loading', text: '' });
  const load = useCallback(async () => {
    setState({ status: 'loading', text: '' });
    try {
      const me = await apiFetch<{ firstName: string }>('/auth/me');
      setState({ status: 'ok', text: `Signed in as ${me.firstName}.` });
    } catch (e) {
      setState({ status: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <LoadingState label="Checking your session…" rows={1} />;
  if (state.status === 'error') return <ErrorState title="Not signed in" message={state.text} onRetry={load} />;
  return (
    <p className="notice notice-success" role="status">
      {state.text}
    </p>
  );
}

export function UiKit() {
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string | string[]>>>({});
  const [failNext, setFailNext] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [crash, setCrash] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY);

  const save = useAction(
    async (data: Form) => {
      await wait(700);
      if (failNext) throw new ApiError('Something went wrong on our side. Please try again in a moment.', 503);
      return data;
    },
    { success: (d) => `“${d.title}” was saved.` },
  );

  // Same shape as the backend's GEN-02 validation response.
  const showServerErrors = useAction(async () => {
    await wait(300);
    throw new ApiError('Some details aren’t right. Check the highlighted fields and try again.', 400, {
      title: ['title must be shorter than or equal to 100 characters'],
      email: ['email must be an email'],
    });
  });

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
    save.clearFieldError(key);
    showServerErrors.clearFieldError(key);
  };
  const fieldError = (key: keyof Form) => errors[key] ?? save.fieldErrors[key] ?? showServerErrors.fieldErrors[key];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.title.trim()) next.title = 'Enter a title.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter an email address like name@example.com.';
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn) next.checkOut = 'Check-out must be after check-in.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => focusFirstError(formRef.current));
      return;
    }
    const saved = await save.run({ ...form, title: form.title.trim(), email: form.email.trim() });
    if (saved) setForm(EMPTY);
    else requestAnimationFrame(() => focusFirstError(formRef.current));
  }

  if (crash) return <Crash />;

  return (
    <>
      <PageHeader
        title="UI kit"
        description="Shared building blocks. Use these so every page looks and behaves the same."
        showBack
        actions={<Button onClick={() => toast.info('This is the page’s main action.')}>Primary action</Button>}
      />

      <section className="section">
        <h2>Buttons</h2>
        <div className="row">
          <Button>Book now</Button>
          <Button variant="secondary">Save as draft</Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Cancel booking
          </Button>
          <Button busy busyLabel="Booking…">
            Book now
          </Button>
        </div>
        <ConfirmDialog
          open={confirmDelete}
          title="Cancel this booking?"
          message="This can’t be undone. Any refund follows the provider’s cancellation policy."
          confirmLabel="Yes, cancel booking"
          cancelLabel="Keep booking"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            toast.success('Booking cancelled.');
          }}
          onClose={() => setConfirmDelete(false)}
        />
      </section>

      <section className="section">
        <h2>Feedback messages</h2>
        <div className="row">
          <Button variant="secondary" onClick={() => toast.success('Your changes were saved.')}>
            Show success
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.error('We couldn’t reach the server. Check your internet connection and try again.', {
                label: 'Try again',
                onClick: () => toast.success('Connected again.'),
              })
            }
          >
            Show error
          </Button>
          <Button variant="secondary" onClick={() => setCrash(true)}>
            Simulate a page error
          </Button>
        </div>
      </section>

      <section className="section">
        <h2>Loading and errors from the server</h2>
        <ServerDemo />
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
        <h2>Table</h2>
        <div className="table-wrap" tabIndex={0} aria-label="Bookings table, scrolls sideways on small screens">
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
        <h2>Form</h2>
        <form ref={formRef} className="card form" onSubmit={submit} noValidate>
          <FormField label="Title" name="title" required error={fieldError('title')} count={{ value: form.title, max: 100 }}>
            {(p) => <input {...p} className="input" maxLength={100} value={form.title} onChange={set('title')} />}
          </FormField>
          <FormField label="Email" name="email" required hint="We send the confirmation here." error={fieldError('email')}>
            {(p) => (
              <input {...p} type="email" inputMode="email" autoComplete="email" className="input" value={form.email} onChange={set('email')} />
            )}
          </FormField>
          <div className="field-row">
            <FormField label="Check-in" name="checkIn" error={fieldError('checkIn')}>
              {(p) => <input {...p} type="date" className="input" min={today()} value={form.checkIn} onChange={set('checkIn')} />}
            </FormField>
            <FormField label="Check-out" name="checkOut" hint="After check-in." error={fieldError('checkOut')}>
              {(p) => (
                <input
                  {...p}
                  type="date"
                  className="input"
                  min={form.checkIn || today()}
                  value={form.checkOut}
                  onChange={set('checkOut')}
                />
              )}
            </FormField>
            <FormField label="Guests" name="guests" error={fieldError('guests')}>
              {(p) => <input {...p} type="number" inputMode="numeric" min={1} max={10} className="input" value={form.guests} onChange={set('guests')} />}
            </FormField>
          </div>
          <FormField label="Notes" name="notes" count={{ value: form.notes, max: 500 }}>
            {(p) => <textarea {...p} className="input" rows={3} maxLength={500} value={form.notes} onChange={set('notes')} />}
          </FormField>
          <label className="checkbox">
            <input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} /> Make the next save fail
            (demo)
          </label>
          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={async () => {
                await showServerErrors.run();
                requestAnimationFrame(() => focusFirstError(formRef.current));
              }} busy={showServerErrors.busy} busyLabel="Checking…">
              Show server field errors
            </Button>
            <CancelButton isDirty={isDirty} fallbackHref="/" />
            <Button type="submit" busy={save.busy} busyLabel="Saving…">
              Save
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
