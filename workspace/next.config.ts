
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
      {
        protocol: 'https',
        hostname: '*.cloudworkstations.dev', // For dynamic CWS preview URLs
        port: '',
        pathname: '/api/images/**', // Assuming your image API route might be here
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
        child_process: false, // Explicitly provide fallback for child_process
        fs: false,
        net: false,
        tls: false,
        os: false,
        path: false,
        http2: false,
        events: false,
        // More aggressive stubs for potentially problematic libraries
        // These might help prevent these libraries from trying to require Node built-ins on the client
        'google-auth-library': false,
        'gcp-metadata': false,
        'firebase-admin': false,
      };
    }
    return config;
  },
};

export default nextConfig;
