/**
 * @jest-environment node
 */
// GEN-17 / accessibility: button and badge text must have at least 4.5:1
// contrast (WCAG AA, normal-size text). Reads the real variant classes and the
// real colours from globals.css, so changing either one re-checks this.

import { readFileSync } from "node:fs";
import path from "node:path";

import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

/** Resolves a CSS custom property from :root to a hex colour, following var(--x). */
function resolve(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular colour token --${name}`);
  seen.add(name);
  const match = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Unknown colour token --${name}`);
  const value = match[1].trim();
  const ref = value.match(/^var\(--([a-z-]+)\)$/);
  if (ref) return resolve(ref[1], seen);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name} is not a hex colour: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Finds the colour token of a utility (text-*, bg-*) in a class list, ignoring sizes like text-sm. */
function colourToken(classes: string, prefix: "text" | "bg"): string {
  const tokens = classes
    .split(/\s+/)
    .filter((c) => c.startsWith(`${prefix}-`))
    .map((c) => c.slice(prefix.length + 1))
    .filter((t) => new RegExp(`--${t}:`).test(root));
  if (tokens.length !== 1) throw new Error(`Expected one ${prefix}- colour in "${classes}", found ${tokens.join(", ") || "none"}`);
  return tokens[0];
}

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const buttonCases: ButtonVariant[] = ["default", "secondary", "neutral", "reverse", "noShadow"];
const badgeCases: BadgeVariant[] = ["default", "neutral"];

describe("text contrast is at least 4.5:1 (normal-size text)", () => {
  it.each(buttonCases)("Button variant %s", (variant) => {
    const classes = buttonVariants({ variant });
    const ratio = contrast(resolve(colourToken(classes, "text")), resolve(colourToken(classes, "bg")));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(badgeCases)("Badge variant %s", (variant) => {
    const classes = badgeVariants({ variant });
    const ratio = contrast(resolve(colourToken(classes, "text")), resolve(colourToken(classes, "bg")));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("Olive Green is not usable as a text background (why secondary uses it as a border)", () => {
    for (const text of ["cream", "brown"]) {
      expect(contrast(resolve(text), resolve("olive"))).toBeLessThan(4.5);
    }
    // Borders and other UI parts need 3:1 (WCAG 1.4.11).
    expect(contrast(resolve("olive"), resolve("cream"))).toBeGreaterThanOrEqual(3);
  });
});
