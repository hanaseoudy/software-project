/**
 * @jest-environment node
 */
import { contrastRatio, hasColourToken, resolveColour } from "./contrast";

describe("contrast test helpers", () => {
  it("resolves palette tokens and role tokens (var(--x)) to hex", () => {
    expect(resolveColour("cream").toLowerCase()).toBe("#f5efdc");
    expect(resolveColour("main").toLowerCase()).toBe("#63383c"); // --main: var(--burgundy)
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("cream", "burgundy")).toBeCloseTo(8.45, 2);
    expect(contrastRatio("foreground", "mustard")).toBeCloseTo(7.0, 2);
    expect(contrastRatio("cream", "olive")).toBeCloseTo(3.93, 2);
    expect(contrastRatio("brown", "brown")).toBe(1);
  });

  it("is the same in both directions", () => {
    expect(contrastRatio("olive", "cream")).toBe(contrastRatio("cream", "olive"));
  });

  it("knows which tokens exist", () => {
    expect(hasColourToken("secondary-background")).toBe(true);
    expect(hasColourToken("sm")).toBe(false);
  });

  it("fails clearly for unknown or non-hex tokens", () => {
    expect(() => resolveColour("not-a-token")).toThrow("Unknown colour token --not-a-token");
    expect(() => resolveColour("overlay")).toThrow("--overlay is not a hex colour");
    expect(() => resolveColour("shadow")).toThrow("is not a hex colour");
  });
});
