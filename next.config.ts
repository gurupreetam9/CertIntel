
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
        protocol: 'https', // Assuming HTTPS for Cloud Workstation URLs
        hostname: '*.cloudworkstations.dev', // Allow any subdomain of cloudworkstations.dev
                                            // This should cover '6000-firebase-studio-1749277515711.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev'
        port: '', // Allow any port (or specify if it's always consistent, e.g., '6000')
        pathname: '/api/images/**', // Restrict to your specific image API path
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent client-side bundling of Node.js core modules by providing fallbacks
      config.resolve.fallback = {
        ...config.resolve.fallback, // Spread existing fallbacks
        fs: false, // Filesystem module
        child_process: false, // Child process module
        net: false, // Net module
        tls: false, // TLS module
        os: false, // OS module
        path: false, // Path module
        http2: false, // HTTP/2 module
        'google-auth-library': false, // Attempt to fully stub out google-auth-library on client
        'gcp-metadata': false, // If gcp-metadata is also causing issues
      };
    }
    return config;
  },
};

export default nextConfig;
