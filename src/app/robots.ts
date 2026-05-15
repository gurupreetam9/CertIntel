import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/profile/', '/profile-settings/', '/ai-feature/', '/delete-account/'],
      },
    ],
    sitemap: 'https://cert-intel.vercel.app/sitemap.xml',
  }
}
