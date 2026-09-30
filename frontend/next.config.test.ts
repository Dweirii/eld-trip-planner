import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

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
});
