import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAirportDateTime, formatAirportTime, formatMoney } from "@/lib/format";

import { FeedbackDemo } from "./feedback-demo";
import { ReferenceDataDemo } from "./reference-data-demo";

export const metadata: Metadata = {
  title: "Design system · Travel Planner",
  description: "GEN-17 palette, fonts and base components.",
};

// GEN-17 reference page for the team: palette, fonts and the base Neobrutalism
// components with our theme. Use it to check that new pages look the same.

const PALETTE = [
  { name: "Cream", hex: "#F5EFDC", use: "Main background", token: "bg-cream", swatch: "bg-cream" },
  { name: "Burgundy", hex: "#63383C", use: "Primary buttons and headings", token: "bg-main", swatch: "bg-burgundy" },
  { name: "Sage Green", hex: "#A8B79A", use: "Secondary backgrounds and components", token: "bg-secondary-background", swatch: "bg-sage" },
  { name: "Olive Green", hex: "#697D50", use: "Secondary buttons and accents", token: "bg-olive", swatch: "bg-olive" },
  { name: "Terracotta", hex: "#C48772", use: "Decorative elements and accents", token: "bg-terracotta", swatch: "bg-terracotta" },
  { name: "Mustard Yellow", hex: "#D9B65D", use: "Highlights", token: "bg-mustard", swatch: "bg-mustard" },
  { name: "Dark Brown", hex: "#352C28", use: "Text, borders and shadows", token: "text-foreground, border-border", swatch: "bg-brown" },
] as const;

// A sample flight: 10:00 in Cairo, arriving 13:30 in London on 5 December 2026.
const SAMPLE_DEPARTURE = "2026-12-05T08:00:00.000Z";
const SAMPLE_ARRIVAL = "2026-12-05T13:30:00.000Z";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl">Design system</h1>
        <p>
          GEN-17: Neobrutalism Components with our palette and fonts. Use these tokens and components on every page.
        </p>
      </header>

      <Section title="Colour palette">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PALETTE.map((colour) => (
            <li key={colour.name} className="rounded-base border-2 border-border bg-background shadow-shadow">
              <div className={`h-16 rounded-t-base border-b-2 border-border ${colour.swatch}`} />
              <div className="flex flex-col gap-1 p-3 text-sm">
                <span className="font-heading">{colour.name}</span>
                <span>{colour.hex}</span>
                <span>{colour.use}</span>
                <code className="text-xs">{colour.token}</code>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <p className="font-display text-5xl font-heading text-main">Fraunces for headings</p>
          <h3 className="text-xl">Heading 3 uses Fraunces too</h3>
          <p>DM Sans for body text, buttons, forms, tables and navigation.</p>
          <p className="text-sm">Small text, for hints and secondary details.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-4">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="neutral">Neutral</Button>
          <Button variant="reverse">Reverse</Button>
          <Button variant="noShadow">No shadow</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges and highlights">
        <div className="flex flex-wrap items-center gap-4">
          <Badge>Default</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <span className="rounded-base border-2 border-border bg-mustard px-2 py-0.5 text-sm">Highlight</span>
          <span className="rounded-base border-2 border-border bg-terracotta px-2 py-0.5 text-sm">Accent</span>
        </div>
      </Section>

      <Section title="Form and card">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-display text-2xl text-main">Find a hotel</CardTitle>
            <CardDescription>Inputs, labels and buttons together.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="ds-city">City</Label>
            <Input id="ds-city" placeholder="e.g. Cairo" />
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button>Search</Button>
            <Button variant="neutral">Cancel</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Formatters">
        <div className="overflow-x-auto rounded-base border-2 border-border shadow-shadow">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead className="bg-secondary-background">
              <tr>
                <th className="border-b-2 border-border p-3">Call</th>
                <th className="border-b-2 border-border p-3">Result</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b-2 border-border p-3"><code>formatMoney(640)</code></td>
                <td className="border-b-2 border-border p-3">{formatMoney(640)}</td>
              </tr>
              <tr>
                <td className="border-b-2 border-border p-3"><code>formatMoney(&quot;1250.5&quot;)</code></td>
                <td className="border-b-2 border-border p-3">{formatMoney("1250.5")}</td>
              </tr>
              <tr>
                <td className="border-b-2 border-border p-3">
                  <code>formatAirportDateTime(departure, &quot;Africa/Cairo&quot;)</code>
                </td>
                <td className="border-b-2 border-border p-3">{formatAirportDateTime(SAMPLE_DEPARTURE, "Africa/Cairo")}</td>
              </tr>
              <tr>
                <td className="p-3">
                  <code>formatAirportTime(arrival, &quot;Europe/London&quot;, &#123; showZone: true &#125;)</code>
                </td>
                <td className="p-3">{formatAirportTime(SAMPLE_ARRIVAL, "Europe/London", { showZone: true })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Loading, success and error feedback (GEN-16)">
        <FeedbackDemo />
      </Section>

      <Section title="Reference-data pickers (GEN-12)">
        <ReferenceDataDemo />
      </Section>
    </main>
  );
}
