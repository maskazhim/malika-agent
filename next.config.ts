import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Static export agar bisa di-deploy ke Cloudflare Pages (semua halaman prerendered)
  output: "export",
};

export default nextConfig;
