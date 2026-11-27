/**
 * @jest-environment node
 */
import { readFileSync } from "fs";
import path from "path";

import { SUPPORTED_CURRENCIES } from "./currencies";

describe("SUPPORTED_CURRENCIES (GEN-12)", () => {
  it("is the same list as the backend's SupportedCurrency enum", () => {
    const source = readFileSync(
      path.join(process.cwd(), "..", "backend", "src", "users", "schemas", "user.schema.ts"),
      "utf8",
    );
    const block = /export enum SupportedCurrency \{([^}]*)\}/.exec(source)?.[1] ?? "";
    const backend = [...block.matchAll(/=\s*'([A-Z]{3})'/g)].map((m) => m[1]);

    expect(backend.length).toBeGreaterThan(0);
    expect(SUPPORTED_CURRENCIES.map((c) => c.code).sort()).toEqual([...backend].sort());
  });

  it("gives every currency a name", () => {
    for (const currency of SUPPORTED_CURRENCIES) expect(currency.name).not.toBe("");
  });
});
