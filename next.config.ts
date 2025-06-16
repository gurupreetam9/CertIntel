
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
  // Add allowedDevOrigins to address cross-origin warnings in development
  experimental: {
    allowedDevOrigins: [
        "http://localhost:9005", // Your local dev port
        "https://*.cloudworkstations.dev", // Allow any cloud workstation subdomain
        // You can add the specific origin from the log if preferred:
        // "https://9005-firebase-studio-1749277515711.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev"
    ]
  }
};

export default nextConfig;
