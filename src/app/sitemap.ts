import { MetadataRoute } from 'next'

const blogSlugs = [
  'how-ai-ocr-transforms-certificate-management',
  'building-personalized-learning-paths-with-nlp',
  'why-digital-certificate-portfolios-matter',
  'securing-student-data-firebase-authentication',
  'admin-analytics-dashboard-deep-dive',
  'from-pdf-to-insight-certintel-processing-pipeline',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const blogEntries: MetadataRoute.Sitemap = blogSlugs.map((slug) => ({
    url: `https://cert-intel.vercel.app/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: 'https://cert-intel.vercel.app/',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://cert-intel.vercel.app/about',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: 'https://cert-intel.vercel.app/blog',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...blogEntries,
    {
      url: 'https://cert-intel.vercel.app/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://cert-intel.vercel.app/register',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]
}
