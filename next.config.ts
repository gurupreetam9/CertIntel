
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
    config.experiments = { ...(config.experiments || {}), asyncWebAssembly: true, topLevelAwait: true };

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
        events: false, // For 'events'
        'node:events': false, // For 'node:events'
        crypto: false, 
        'node:crypto': false,
        stream: false, 
        'node:stream': false,
        util: false,   
        'node:util': false,
        zlib: false,   
        'node:zlib': false,
        assert: false, 
        'node:assert': false,
        constants: false, 
        'node:constants': false,
        vm: false, 
        'node:vm': false,
        'google-auth-library': false,
        'gcp-metadata': false,
        'firebase-admin': false, 
      };
    }
    return config;
  },
};

export default nextConfig;
