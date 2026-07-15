import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent partysocket (WebSocket) from being bundled in the server/middleware
  serverExternalPackages: ["partysocket", "partykit"],
};

export default nextConfig;
