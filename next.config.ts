
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
    // Enable WebAssembly
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };

    if (!isServer) {
      // Prevent client-side bundling of Node.js core modules by providing fallbacks
      // Ensure this fallback object is correctly structured and comprehensive
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}), 
        fs: false, 
        child_process: false, 
        net: false, 
        tls: false, 
        os: false, 
        path: false, 
        http2: false, 
        'google-auth-library': false, // Attempt to fully stub out google-auth-library on client
        'gcp-metadata': false, // If gcp-metadata is also causing issues
      };
    }
    // Important: return the modified config
    return config;
  },
};

export default nextConfig;
