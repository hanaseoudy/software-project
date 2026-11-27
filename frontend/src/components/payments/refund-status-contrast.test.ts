/**
 * @jest-environment node
 */
// GEN-17: the refund badge text must have at least 4.5:1 contrast on its background.
import { contrastRatio } from "@/test-utils/contrast";

describe("refund badge colours (PAYC-4, GEN-17)", () => {
  it.each([
    ["pending", "foreground", "mustard"],
    ["refunded", "foreground", "secondary-background"],
    ["failed", "main-foreground", "main"],
  ])("%s: text has at least 4.5:1 contrast", (_status, text, background) => {
    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
  });
});
