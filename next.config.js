/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    dirs: ["."],
  },
  optimizeFonts: false,
  swcMinify: true,
};

module.exports = nextConfig;
