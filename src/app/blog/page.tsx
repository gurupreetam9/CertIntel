import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  Calendar,
  Clock,
  BookOpen,
  Sparkles,
  GraduationCap,
  ChevronRight,
} from 'lucide-react';
import { blogPosts } from './_data/posts';

export const metadata: Metadata = {
  title: 'CertIntel Blog — AI Certificate Analysis, EdTech Insights & Learning Guides',
  description:
    'Stay updated with insights on AI-powered certificate analysis, educational technology, OCR advancements, and personalized learning paths. Expert articles from the CertIntel team.',
  keywords: [
    'CertIntel Blog',
    'AI Certificate Analysis Blog',
    'EdTech Blog',
    'OCR Technology Articles',
    'YOLOv8 Education',
    'Certificate Management Tips',
    'AI Learning Recommendations',
    'Digital Credentials Blog',
    'Student Certificate Tips',
    'Course Recommendation AI',
  ],
  openGraph: {
    title: 'CertIntel Blog — AI, Certificates & Education',
    description:
      'Expert insights on AI-powered certificate analysis, OCR technology, and smart learning recommendations.',
    url: 'https://cert-intel.vercel.app/blog',
    siteName: 'CertIntel',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cert-intel.vercel.app/blog',
  },
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    'AI & Technology': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
    Product: 'bg-primary/10 text-primary-foreground border-primary/20',
    Career: 'bg-green-500/10 text-green-700 border-green-500/20',
    Security: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
    Engineering: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  };
  return colors[category] || 'bg-muted text-muted-foreground border-border';
}

export default function BlogPage() {
  const featuredPosts = blogPosts.filter((p) => p.featured);
  const regularPosts = blogPosts.filter((p) => !p.featured);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
        <div className="container relative mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary-foreground">
              <BookOpen className="h-4 w-4" />
              CertIntel Blog
            </div>
            <h1 className="mb-4 text-4xl font-bold font-headline leading-tight tracking-tight md:text-5xl">
              Insights on{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                AI, Certificates & Education
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Expert articles on AI-powered certificate analysis, OCR technology, educational
              data security, and building smarter learning paths.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="container mx-auto px-4 py-12 md:py-16">
          <div className="mb-8 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold font-headline">Featured Articles</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {featuredPosts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="block">
                <Card
                  className="group relative h-full cursor-pointer overflow-hidden border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <CardContent className="relative p-6 md:p-8">
                    <div className="mb-4 flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getCategoryColor(
                          post.category
                        )}`}
                      >
                        {post.category}
                      </span>
                      <span className="text-xs text-muted-foreground">Featured</span>
                    </div>
                    <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3">
                      <post.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="mb-3 text-xl font-bold font-headline leading-snug transition-colors group-hover:text-primary md:text-2xl">
                      {post.title}
                    </h3>
                    <p className="mb-6 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(post.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {post.readTime}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Read more
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* All Posts */}
      <section className="container mx-auto px-4 pb-16 md:pb-24">
        <div className="mb-8 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold font-headline">All Articles</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {regularPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="block">
              <Card
                className="group h-full cursor-pointer border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getCategoryColor(
                        post.category
                      )}`}
                    >
                      {post.category}
                    </span>
                  </div>
                  <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5">
                    <post.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold font-headline leading-snug transition-colors group-hover:text-primary">
                    {post.title}
                  </h3>
                  <p className="mb-4 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(post.date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {post.readTime}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Coming Soon Note */}
        <div className="mt-12 text-center">
          <div className="mx-auto inline-flex max-w-lg flex-col items-center rounded-2xl border border-dashed border-border/80 bg-card/50 p-8">
            <BookOpen className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold font-headline">More Articles Coming Soon</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              We&apos;re working on new content covering AI in education, certificate verification
              standards, and advanced analytics. Stay tuned!
            </p>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/register">
                Join CertIntel
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/50">
        <div className="container mx-auto px-4 py-16">
          <div className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 p-8 text-center shadow-sm md:p-12">
            <GraduationCap className="mx-auto mb-4 h-10 w-10 text-primary" />
            <h2 className="mb-3 text-2xl font-bold font-headline md:text-3xl">
              Start Analyzing Your Certificates
            </h2>
            <p className="mb-6 text-muted-foreground">
              Upload your certificates and let AI do the rest — course extraction, recommendations,
              and portfolio management.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href="/register">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/about">Learn More About CertIntel</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'CertIntel Blog',
            url: 'https://cert-intel.vercel.app/blog',
            description:
              'Insights on AI-powered certificate analysis, educational technology, and smart learning paths.',
            publisher: {
              '@type': 'Organization',
              name: 'CertIntel',
              url: 'https://cert-intel.vercel.app',
            },
            blogPost: blogPosts.map((post) => ({
              '@type': 'BlogPosting',
              headline: post.title,
              description: post.excerpt,
              datePublished: post.date,
              url: `https://cert-intel.vercel.app/blog/${post.slug}`,
              author: {
                '@type': 'Person',
                name: 'Gurupreetam',
              },
            })),
          }),
        }}
      />
    </div>
  );
}
