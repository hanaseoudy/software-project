/**
 * @jest-environment node
 */
// GEN-17: the refund badge text must have at least 4.5:1 contrast on its background.
// Reads the real colours from globals.css.
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

function resolve(name: string): string {
  const value = root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`Unknown colour token --${name}`);
  const ref = value.match(/^var\(--([a-z-]+)\)$/);
  return ref ? resolve(ref[1]) : value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(resolve(a)), luminance(resolve(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("refund badge colours (PAYC-4, GEN-17)", () => {
  it.each([
    ["pending", "foreground", "mustard"],
    ["refunded", "foreground", "secondary-background"],
    ["failed", "main-foreground", "main"],
  ])("%s: text has at least 4.5:1 contrast", (_status, text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });
});
