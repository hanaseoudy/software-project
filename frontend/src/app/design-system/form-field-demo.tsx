"use client";

import { useState } from "react";
import { FormField } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FieldErrors } from "@/lib/api";

const SAMPLE_ERRORS: FieldErrors = {
  email: ["Enter a valid email address.", "Use the email address for this booking."],
  "days.0.city": ["Choose a city for the first day."],
};

export function FormFieldDemo() {
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <div className="flex w-full max-w-lg flex-col gap-4 rounded-base border-2 border-border bg-background p-4 shadow-shadow">
      <p className="text-sm">Preview field feedback. These example messages make no backend requests.</p>
      <FormField name="email" label="Booking email" hint="We'll use this to identify your booking." errors={errors} required>
        {props => <Input {...props} type="email" />}
      </FormField>
      <FormField name="days.0.city" label="First-day city" errors={errors}>
        {props => <Input {...props} />}
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => setErrors(SAMPLE_ERRORS)}>Show field errors</Button>
        <Button type="button" variant="secondary" onClick={() => setErrors({})}>Clear field errors</Button>
      </div>
    </div>
  );
}
