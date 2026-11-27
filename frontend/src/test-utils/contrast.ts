// Test helpers for colour contrast (GEN-17, WCAG 2.x). Tests only: reads
// src/app/globals.css from disk, so never import this from app code.
//
//   import { contrastRatio } from "@/test-utils/contrast";
//   expect(contrastRatio("foreground", "mustard")).toBeGreaterThanOrEqual(4.5);
//
// Pass theme token names without "--" (e.g. "foreground", "main", "sage").
// Normal-size text needs at least 4.5:1; borders and other UI parts at least 3:1.

import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
const rootStart = css.indexOf(":root {");
const root = css.slice(rootStart, css.indexOf("}", rootStart));

/** True when globals.css defines the colour token `--<name>` in :root. */
export function hasColourToken(name: string): boolean {
  return new RegExp(`--${name}:`).test(root);
}

/** Resolves a :root colour token to its hex value, following var(--other) references. */
export function resolveColour(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular colour token --${name}`);
  seen.add(name);
  const match = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Unknown colour token --${name}`);
  const value = match[1].trim();
  const ref = value.match(/^var\(--([a-z-]+)\)$/);
  if (ref) return resolveColour(ref[1], seen);
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

/** WCAG contrast ratio (1 to 21) between two theme tokens, e.g. contrastRatio("foreground", "mustard"). */
export function contrastRatio(textToken: string, backgroundToken: string): number {
  const [hi, lo] = [luminance(resolveColour(textToken)), luminance(resolveColour(backgroundToken))].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}
