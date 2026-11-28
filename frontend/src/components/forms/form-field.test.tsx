import { fireEvent, render, screen } from "@testing-library/react";

import { Input } from "@/components/ui/input";
import { toApiError } from "@/lib/api/errors";
import { contrastRatio } from "@/test-utils/contrast";
import { FormField } from "./form-field";

test("GEN-02 maps all backend messages to the exact dotted field, not its sibling", () => {
  const error = toApiError(400, { message: "Validation failed", errors: {
    "days.0.city": ["City is required", "Choose a supported city"],
    "days.1.city": ["Second city is invalid"],
  } });
  render(<>
    <FormField name="days.0.city" label="First city" errors={error.fieldErrors}>{props => <Input {...props} />}</FormField>
    <FormField name="days.1.city" label="Second city" errors={error.fieldErrors}>{props => <Input {...props} />}</FormField>
  </>);
  expect(screen.getByRole("textbox", { name: "First city" })).toHaveAccessibleDescription("City is required Choose a supported city");
  expect(screen.getByRole("textbox", { name: "Second city" })).toHaveAccessibleDescription("Second city is invalid");
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.getByRole("textbox", { name: "First city" })).toHaveAttribute("aria-invalid", "true");
});

test("GEN-16 associates label, hint, additional description and errors with the control", () => {
  render(<>
    <p id="extra">Additional help</p>
    <FormField id="booking-email" name="email" label="Email" hint="Use your booking email" describedBy="extra" errors={{ email: ["Invalid email"] }} required>
      {props => <Input {...props} type="email" />}
    </FormField>
  </>);
  const input = screen.getByRole("textbox", { name: "Email (required)" });
  expect(input).toBeRequired();
  expect(input).toHaveAttribute("id", "booking-email");
  expect(input).toHaveAttribute("name", "email");
  expect(input).toHaveAccessibleDescription("Additional help Use your booking email Invalid email");
});

test("GEN-02 clearing errors removes stale invalid state but preserves hint and value", () => {
  const field = (errors: Record<string, string[]>) => <FormField name="city" label="City" hint="Choose your destination" errors={errors}>{props => <Input {...props} defaultValue="Cairo" />}</FormField>;
  const view = render(field({ city: ["Invalid city"] }));
  const input = screen.getByRole("textbox", { name: "City" });
  const originalId = input.id;
  view.rerender(field({}));
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).toHaveAccessibleDescription("Choose your destination");
  expect(input).toHaveValue("Cairo");
  expect(input.id).toBe(originalId);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("GEN-16 repeated field names receive unique label and description IDs", () => {
  render(<>{["Departure", "Arrival"].map(label => <FormField key={label} name="city" label={label} hint={`${label} hint`}>{props => <Input {...props} />}</FormField>)}</>);
  const departure = screen.getByRole("textbox", { name: "Departure" });
  const arrival = screen.getByRole("textbox", { name: "Arrival" });
  expect(departure.id).not.toBe(arrival.id);
  expect(departure).toHaveAccessibleDescription("Departure hint");
  expect(arrival).toHaveAccessibleDescription("Arrival hint");
});

test("GEN-02 missing, empty and inherited entries do not produce errors", () => {
  render(<>{["missing", "empty", "blank", "toString"].map(name => <FormField key={name} name={name} label={name} errors={{ empty: [], blank: [" "] }}>{props => <Input {...props} />}</FormField>)}</>);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  screen.getAllByRole("textbox").forEach(input => {
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});

test("GEN-16 preserves control events and supports textarea and select attributes", () => {
  const onChange = jest.fn();
  render(<>
    <FormField name="notes" label="Notes">{props => <textarea {...props} onChange={onChange} />}</FormField>
    <FormField name="city" label="City" disabled errors={{ city: ["Choose a city"] }}>{props => <select {...props}><option>Cairo</option></select>}</FormField>
  </>);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Travel notes" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("textbox")).toHaveValue("Travel notes");
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByRole("combobox")).toHaveAccessibleDescription("Choose a city");
});

test("GEN-02 renders backend text literally without treating it as HTML", () => {
  render(<FormField name="email" label="Email" errors={{ email: ["<img src=x onerror=alert(1)>"] }}>{props => <Input {...props} />}</FormField>);
  expect(screen.getByRole("alert")).toHaveTextContent("<img src=x onerror=alert(1)>");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("GEN-17 error text has AA contrast on the documented form backgrounds", () => {
  expect(contrastRatio("main", "background")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("main", "secondary-background")).toBeGreaterThanOrEqual(4.5);
});
