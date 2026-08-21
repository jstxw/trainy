import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/places/search": ["./data/stations.json", "./data/airports.json"],
  },
};

export default nextConfig;
