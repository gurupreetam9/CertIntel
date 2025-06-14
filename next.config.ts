
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
        // Added 'events' here as it's a common Node.js module
        // that can cause issues if not polyfilled or excluded
        events: false,
        // Attempt to stub out modules that are known to cause issues if pulled client-side
        // 'google-auth-library': false, // Keep this commented for now to see if other fallbacks are enough
        // 'gcp-metadata': false, // Keep this commented for now
      };
    }
    return config;
  },
};

export default nextConfig;
