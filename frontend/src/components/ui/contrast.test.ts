/**
 * @jest-environment node
 */
// GEN-17 / accessibility: button and badge text must have at least 4.5:1
// contrast (WCAG AA, normal-size text). Reads the real variant classes and the
// real colours from globals.css, so changing either one re-checks this.

import type { VariantProps } from "class-variance-authority";

import { contrastRatio, hasColourToken } from "@/test-utils/contrast";

import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";

/** Finds the colour token of a utility (text-*, bg-*) in a class list, ignoring sizes like text-sm. */
function colourToken(classes: string, prefix: "text" | "bg"): string {
  const tokens = classes
    .split(/\s+/)
    .filter((c) => c.startsWith(`${prefix}-`))
    .map((c) => c.slice(prefix.length + 1))
    .filter(hasColourToken);
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
    expect(contrastRatio(colourToken(classes, "text"), colourToken(classes, "bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(badgeCases)("Badge variant %s", (variant) => {
    const classes = badgeVariants({ variant });
    expect(contrastRatio(colourToken(classes, "text"), colourToken(classes, "bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("Olive Green is not usable as a text background (why secondary uses it as a border)", () => {
    for (const text of ["cream", "brown"]) {
      expect(contrastRatio(text, "olive")).toBeLessThan(4.5);
    }
    // Borders and other UI parts need 3:1 (WCAG 1.4.11).
    expect(contrastRatio("olive", "cream")).toBeGreaterThanOrEqual(3);
  });
});
