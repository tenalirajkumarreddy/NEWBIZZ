/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Deno Edge Function lives under supabase/functions and must never be
  // pulled into the Next.js build.
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
