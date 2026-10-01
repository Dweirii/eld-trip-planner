import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function freshConfig() {
  vi.resetModules();
  return (await import("./next.config")).default;
}

describe("next.config", () => {
  it("proxies /api/* to Django and re-adds the trailing slash Django requires", async () => {
    const rewrites = await nextConfig.rewrites!();
    expect(rewrites).toEqual([
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*/" },
    ]);
  });

  it("never redirects trailing slashes (a redirect drops POST bodies)", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  });

  it("strips a trailing slash from API_BASE_URL", async () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.test/");
    const config = await freshConfig();
    expect(await config.rewrites!()).toEqual([
      { source: "/api/:path*", destination: "https://api.example.test/api/:path*/" },
    ]);
  });

  it("refuses to build on Vercel without API_BASE_URL (it would proxy to localhost)", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("API_BASE_URL", undefined);
    await expect(freshConfig()).rejects.toThrow(/API_BASE_URL/);
  });
});
