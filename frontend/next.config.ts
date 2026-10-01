import path from "node:path";
import type { NextConfig } from "next";

// Read at build time (the /api rewrite below) and at run time (lib/api/server.ts renders /trips/[id]).
if (process.env.VERCEL && !process.env.API_BASE_URL) {
  throw new Error(
    "API_BASE_URL is not set. On Vercel it must point at the deployed Django API, or /api/* would proxy to localhost.",
  );
}
const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Django's routes end with "/". Never redirect on trailing slashes: a redirect drops POST bodies.
  skipTrailingSlashRedirect: true,
  // The parent folder holds another Next.js app; pin the workspace root to this one.
  turbopack: { root: path.resolve(__dirname) },
  async rewrites() {
    // Keep the browser on one origin. The rewrite strips the trailing slash, so the
    // destination adds it back.
    return [{ source: "/api/:path*", destination: `${API_BASE_URL}/api/:path*/` }];
  },
};

export default nextConfig;
