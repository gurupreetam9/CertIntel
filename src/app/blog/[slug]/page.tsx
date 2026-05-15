import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Clock, ArrowRight } from 'lucide-react';
import { blogPosts } from '../_data/posts';

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

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) return { title: 'Post Not Found — CertIntel Blog' };

  return {
    title: `${post.title} — CertIntel Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `https://cert-intel.vercel.app/blog/${post.slug}`,
      siteName: 'CertIntel',
      type: 'article',
      publishedTime: post.date,
      authors: ['Gurupreetam'],
    },
    alternates: {
      canonical: `https://cert-intel.vercel.app/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const currentIndex = blogPosts.findIndex((p) => p.slug === slug);
  const prevPost = currentIndex > 0 ? blogPosts[currentIndex - 1] : null;
  const nextPost = currentIndex < blogPosts.length - 1 ? blogPosts[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Article Header */}
      <header className="relative border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
        <div className="container relative mx-auto px-4 py-12 md:py-16">
          <div className="mx-auto max-w-3xl">
            <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 gap-2 text-muted-foreground">
              <Link href="/blog">
                <ArrowLeft className="h-4 w-4" />
                Back to Blog
              </Link>
            </Button>

            <div className="mb-4 flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getCategoryColor(post.category)}`}>
                {post.category}
              </span>
            </div>

            <h1 className="mb-4 text-3xl font-bold font-headline leading-tight tracking-tight md:text-4xl lg:text-5xl">
              {post.title}
            </h1>

            <p className="mb-6 text-lg text-muted-foreground leading-relaxed">
              {post.excerpt}
            </p>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(post.date)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {post.readTime}
              </span>
              <span className="hidden sm:inline">By <strong className="text-foreground">Gurupreetam</strong></span>
            </div>
          </div>
        </div>
      </header>

      {/* Article Content */}
      <article className="container mx-auto px-4 py-10 md:py-16">
        <div className="prose prose-lg mx-auto max-w-3xl
          prose-headings:font-headline prose-headings:tracking-tight
          prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-li:text-muted-foreground
          prose-strong:text-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-ul:my-4 prose-ol:my-4
        ">
          {post.content}
        </div>
      </article>

      {/* Navigation */}
      <nav className="border-t border-border/50">
        <div className="container mx-auto px-4 py-8">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            {prevPost ? (
              <Link href={`/blog/${prevPost.slug}`} className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary">
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                <span className="hidden sm:inline">{prevPost.title.length > 40 ? prevPost.title.slice(0, 40) + '…' : prevPost.title}</span>
                <span className="sm:hidden">Previous</span>
              </Link>
            ) : <div />}

            <Button asChild variant="outline" size="sm">
              <Link href="/blog">All Articles</Link>
            </Button>

            {nextPost ? (
              <Link href={`/blog/${nextPost.slug}`} className="group flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary">
                <span className="hidden sm:inline">{nextPost.title.length > 40 ? nextPost.title.slice(0, 40) + '…' : nextPost.title}</span>
                <span className="sm:hidden">Next</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : <div />}
          </div>
        </div>
      </nav>

      {/* CTA */}
      <section className="border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 py-12">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="mb-3 text-xl font-bold font-headline">Ready to try CertIntel?</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Upload your certificates and get AI-powered course recommendations in minutes.
            </p>
            <Button asChild className="gap-2">
              <Link href="/register">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            url: `https://cert-intel.vercel.app/blog/${post.slug}`,
            author: { '@type': 'Person', name: 'Gurupreetam' },
            publisher: {
              '@type': 'Organization',
              name: 'CertIntel',
              url: 'https://cert-intel.vercel.app',
            },
          }),
        }}
      />
    </div>
  );
}
