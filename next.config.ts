import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // arise-it-portal is a separate Worker project living in this monorepo; keep
  // Next's compiler out of it.
  outputFileTracingExcludes: {
    "*": ["./arise-it-portal/**"],
  },
};

export default nextConfig;
