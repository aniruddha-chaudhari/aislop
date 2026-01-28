import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cross-origin requests for development
  allowedDevOrigins: ['localhost', '127.0.0.1'],
};

export default nextConfig;
