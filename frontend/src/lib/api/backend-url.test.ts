import { DEV_BACKEND_URL, getBackendUrl } from "./backend-url";

const env = (values: Record<string, string | undefined>) => values as unknown as NodeJS.ProcessEnv;

describe("getBackendUrl", () => {
  it("returns BACKEND_URL without trailing slashes", () => {
    expect(getBackendUrl(env({ BACKEND_URL: "https://api.example.com/", NODE_ENV: "production" }))).toBe(
      "https://api.example.com",
    );
  });

  it("falls back to localhost:3000 in development only", () => {
    expect(getBackendUrl(env({ NODE_ENV: "development" }))).toBe(DEV_BACKEND_URL);
  });

  it.each(["production", "test", undefined])("throws when BACKEND_URL is missing (NODE_ENV=%s)", (nodeEnv) => {
    expect(() => getBackendUrl(env({ NODE_ENV: nodeEnv }))).toThrow(/BACKEND_URL is not set/);
  });

  it("rejects values that are not http(s) URLs", () => {
    expect(() => getBackendUrl(env({ BACKEND_URL: "localhost:3000" }))).toThrow(/http:\/\/ or https:\/\//);
    expect(() => getBackendUrl(env({ BACKEND_URL: "not a url" }))).toThrow(/not a valid URL/);
  });
});
