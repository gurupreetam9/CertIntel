
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
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
      // If you need to load images from other *.cloudworkstations.dev hostnames
      // (not the one serving your app), you can keep a general entry.
      // However, for images served by your app's own /api/images/... route,
      // no entry is needed here.
      // Example:
      // {
      //   protocol: 'https',
      //   hostname: '*.another-cws-domain.com', 
      // },
    ],
  },
  webpack: (config, { isServer }) => {
    // Enable WebAssembly and Top-Level Await
    config.experiments = { ...(config.experiments || {}), asyncWebAssembly: true, topLevelAwait: true };

    if (!isServer) {
      // Prevent client-side bundling of Node.js core modules by providing fallbacks
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        child_process: false,
        fs: false,
        net: false,
        tls: false,
        os: false,
        path: false,
        http2: false,
        events: false,
        // Fallbacks for modules often problematic with firebase-admin or google-auth-library
        'google-auth-library': false,
        'gcp-metadata': false,
        'firebase-admin': false,
        // Explicitly handle node-prefixed versions if encountered
        'node:child_process': false,
        'node:fs': false,
        'node:net': false,
        'node:tls': false,
        'node:os': false,
        'node:path': false,
        'node:http2': false,
        'node:events': false,
      };
    }
    return config;
  },
};

export default nextConfig;
