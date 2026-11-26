import type { NextConfig } from "next";

import { getBackendUrl } from "./src/lib/api/backend-url";

const nextConfig: NextConfig = {
  turbopack: {
    // The repository root has its own (empty) package-lock.json; keep Next.js
    // scoped to this folder.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // Same-origin API proxy (ACC-19). The browser calls /api/* on the frontend's
  // own origin and Next.js forwards it to the NestJS backend, so:
  //   - the httpOnly, Secure, SameSite=Strict auth cookies stay first-party
  //     (no CORS and no backend changes needed);
  //   - the refresh_token cookie (path /api/auth) is sent to /api/auth/refresh;
  //   - the backend address stays server-side (BACKEND_URL, not NEXT_PUBLIC_*).
  // Rewrites are evaluated at build time on Vercel, so BACKEND_URL must be set
  // for every build (Vercel project settings, CI).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${getBackendUrl()}/api/:path*`,
      },
    ];
  },

  experimental: {
    // When Next.js itself forwards /api/* (next dev, next start), it buffers the
    // request body and silently cuts it off at 10 MB by default. The largest
    // upload the backend accepts is a hotel's 5 images x 5 MB (GEN-08) in one
    // request (~25 MB + multipart overhead), so allow 30 MB.
    // Verified locally on FND-1; on Vercel, external rewrites are handled by the
    // platform, so check uploads again on the first preview deployment.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
