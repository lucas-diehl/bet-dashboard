/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@bet/contract", "@bet/core", "@bet/db"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
