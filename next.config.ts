import type { NextConfig } from 'next';

// Response security headers are maintained in proxy.ts so there is one policy
// to review and deployment adapters do not accidentally drift apart.
const nextConfig: NextConfig = {};

export default nextConfig;
