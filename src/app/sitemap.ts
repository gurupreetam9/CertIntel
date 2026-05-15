import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://cert-intel.vercel.app/',
      lastModified: new Date(),
    },
  ]
}
