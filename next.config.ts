import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Source PNGs are large; serve modern compressed formats via next/image.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
