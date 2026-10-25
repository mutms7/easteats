import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, distDir: process.env.EAST_EATS_TEST === 'true' ? '.next-e2e' : '.next' };
export default config;
