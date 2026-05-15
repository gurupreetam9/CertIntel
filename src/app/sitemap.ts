import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://cert-intel.vercel.app/',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    // {
    //   url: 'https://cert-intel.vercel.app/login',
    //   lastModified: new Date(),
    //   changeFrequency: 'monthly',
    //   priority: 0.8,
    // },
  ]
}
