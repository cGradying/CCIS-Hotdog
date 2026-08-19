import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(path.dirname(new URL(import.meta.url).pathname), '..'),
};

export default nextConfig;