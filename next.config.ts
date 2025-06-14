
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.cloudworkstations.dev',
        port: '',
        pathname: '/api/images/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Enable WebAssembly and Top-Level Await
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };

    if (!isServer) {
      // Prevent client-side bundling of Node.js core modules by providing fallbacks
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        child_process: false,
        net: false,
        tls: false,
        os: false,
        path: false,
        http2: false,
        events: false, // Added for 'node:events'
        crypto: false, // Common Node.js module
        stream: false, // Common Node.js module
        util: false,   // Common Node.js module
        zlib: false,   // Common Node.js module
        assert: false, // Common Node.js module
        constants: false, // Common Node.js module
        vm: false, // Common Node.js module
        // More aggressive stubs for libraries known to cause issues on client
        'google-auth-library': false,
        'gcp-metadata': false,
        'firebase-admin': false, // Attempt to fully stub out firebase-admin itself for client
      };
    }
    return config;
  },
};

export default nextConfig;
