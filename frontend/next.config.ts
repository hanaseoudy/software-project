import type { NextConfig } from 'next';

// The backend serves everything under /api (see backend/src/main.ts).
// Proxying it keeps the auth cookies same-origin, so SameSite=Strict works (ACC-19).
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  // The frontend folder is its own project (stops Next.js picking up lockfiles elsewhere).
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
