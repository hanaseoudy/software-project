import { ApiError, isUnauthorized, toApiError } from "./errors";

describe("toApiError", () => {
  it("keeps the GEN-02 validation shape", () => {
    const error = toApiError(400, { message: "Validation failed", errors: { "days.0.city": ["city is required"] } });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("Validation failed");
    expect(error.fieldErrors).toEqual({ "days.0.city": ["city is required"] });
  });

  it("joins Nest's array messages", () => {
    expect(toApiError(400, { message: ["a is wrong", "b is wrong"] }).message).toBe("a is wrong b is wrong");
  });

  it("falls back to a plain message when the body has none", () => {
    expect(toApiError(403, undefined).message).toBe("You don't have permission to do this.");
    expect(toApiError(503, "<html>Bad gateway</html>").message).toMatch(/Something went wrong on our side/);
    expect(toApiError(413, undefined).message).toBe("The upload is too large.");
  });

  it("ignores malformed field errors", () => {
    expect(toApiError(400, { message: "x", errors: { a: [1, "ok"], b: 5, c: "single" } }).fieldErrors).toEqual({
      a: ["ok"],
      c: ["single"],
    });
  });

  it("recognises 401", () => {
    expect(isUnauthorized(toApiError(401, {}))).toBe(true);
    expect(isUnauthorized(toApiError(403, {}))).toBe(false);
    expect(isUnauthorized(new Error("x"))).toBe(false);
  });
});
