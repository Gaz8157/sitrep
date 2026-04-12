import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev access from local network / tunnel
  allowedDevOrigins: ["100.69.113.86", "192.168.1.49"],
  // API proxying is handled by server.mjs — no rewrites needed
};

export default nextConfig;
