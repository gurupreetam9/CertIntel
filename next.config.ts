
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
};

export default nextConfig;
