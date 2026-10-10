import type { NextConfig } from "next";

// Server-side only: the browser always calls same-origin /api/v1 so auth cookies stay first-party.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/kvieciam/login",
        permanent: false,
      },
      {
        source: "/register",
        destination: "/kvieciam/register",
        permanent: false,
      },
      {
        source: "/host/:path*",
        destination: "/kvieciam/host/:path*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/kvieciam/login",
        destination: "/login",
      },
      {
        source: "/kvieciam/register",
        destination: "/register",
      },
      {
        source: "/kvieciam/host/:path*",
        destination: "/host/:path*",
      },
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
