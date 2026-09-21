import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/controles-varios-sk",
  assetPrefix: "/controles-varios-sk/",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
