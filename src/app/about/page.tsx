import type { Metadata } from 'next';
import Link from 'next/link';
import AppLogo from '@/components/common/AppLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  BrainCircuit,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  Github,
  ArrowRight,
  Zap,
  Globe,
  Users,
  FileText,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'About CertIntel — AI-Powered Certificate Analysis Platform',
  description:
    'Learn about CertIntel, the AI-powered certificate management platform that uses YOLOv8 OCR, NLP, and recommendation systems to help students and educators analyze certificates and discover personalized learning paths.',
  keywords: [
    'About CertIntel',
    'AI Certificate Analysis',
    'YOLOv8 OCR Platform',
    'Certificate Management Tool',
    'AI Education Technology',
    'Course Recommendation System',
    'Student Certificate Organizer',
    'EdTech AI Platform',
  ],
  openGraph: {
    title: 'About CertIntel — AI Certificate Intelligence Platform',
    description:
      'CertIntel uses cutting-edge AI to extract, organize, and analyze certificate data — recommending personalized learning paths for students and educators.',
    url: 'https://cert-intel.vercel.app/about',
    siteName: 'CertIntel',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cert-intel.vercel.app/about',
  },
};

const features = [
  {
    icon: BrainCircuit,
    title: 'AI-Powered OCR',
    description:
      'Our YOLOv8-based computer vision pipeline extracts course names and metadata from certificate images and PDFs with high accuracy.',
  },
  {
    icon: Sparkles,
    title: 'Smart Recommendations',
    description:
      'NLP-driven course recommendation engine analyzes your completed certifications and suggests personalized next steps in your learning journey.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Private',
    description:
      'Built on Firebase Authentication with optional two-factor verification, role-based access control, and encrypted data storage.',
  },
  {
    icon: Users,
    title: 'Student-Admin Linking',
    description:
      'Educators can link with students to view and manage their certificate portfolios, with real-time request notifications and email alerts.',
  },
  {
    icon: FileText,
    title: 'PDF & Image Support',
    description:
      'Upload certificates as images or multi-page PDFs. Our system auto-converts PDF pages into individual certificate entries for analysis.',
  },
  {
    icon: Zap,
    title: 'Admin Analytics Dashboard',
    description:
      'Rich analytics with interactive charts showing course distribution, upload trends, and student-level certificate tracking with export capabilities.',
  },
];

const techStack = [
  { category: 'Frontend', items: 'Next.js 15, React 18, TypeScript, Tailwind CSS, ShadCN UI' },
  { category: 'AI / OCR', items: 'YOLOv8, Tesseract.js, Google Genkit, Cohere AI, Python Flask' },
  { category: 'Backend', items: 'Next.js API Routes, Firebase Admin SDK' },
  { category: 'Database', items: 'MongoDB (GridFS), Firebase Firestore' },
  { category: 'Auth', items: 'Firebase Authentication with 2FA' },
  { category: 'Deployment', items: 'Vercel, Firebase App Hosting, Hugging Face Spaces' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/5" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
        <div className="container relative mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
              AI-Powered Education Technology
            </div>
            <h1 className="mb-6 text-4xl font-bold font-headline leading-tight tracking-tight md:text-5xl lg:text-6xl">
              About{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                CertIntel
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              CertIntel is an AI-powered certificate management and intelligence platform designed
              for students and educators. Upload, organize, and analyze your certificates — then
              discover your personalized next learning steps.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
                <Link href="/register">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2">
                <a
                  href="https://github.com/gurupreetam9/CertIntel"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4" />
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="border-y border-border/50 bg-card/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold font-headline md:text-4xl">Our Mission</h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Managing certificates shouldn&apos;t be a chore. CertIntel was built to solve the
              fragmented experience students face when tracking their certifications across dozens
              of platforms. By combining{' '}
              <strong className="text-foreground">computer vision</strong>,{' '}
              <strong className="text-foreground">natural language processing</strong>, and{' '}
              <strong className="text-foreground">intelligent recommendations</strong>, we turn a
              static pile of PDFs into an actionable, AI-curated learning roadmap.
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold font-headline md:text-4xl">
            What Makes CertIntel Different
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            A full-stack AI platform purpose-built for certificate intelligence.
          </p>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <CardContent className="p-6">
                <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 transition-colors group-hover:bg-primary/20">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold font-headline">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-y border-border/50 bg-card/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold font-headline md:text-4xl">How It Works</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              From upload to insight in three simple steps.
            </p>
          </div>
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Upload Certificates',
                description:
                  'Drag and drop certificate images or PDFs. Multi-page PDFs are automatically split into individual entries.',
              },
              {
                step: '02',
                title: 'AI Extracts & Analyzes',
                description:
                  'Our YOLOv8 OCR pipeline reads your certificates, identifies course names, and maps them to a knowledge graph.',
              },
              {
                step: '03',
                title: 'Get Recommendations',
                description:
                  'Receive personalized next-course suggestions powered by NLP analysis of your completed certifications.',
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white shadow-lg">
                  {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold font-headline">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold font-headline md:text-4xl">Built With</h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            A modern, production-grade tech stack optimized for performance, security, and AI
            capabilities.
          </p>
        </div>
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {techStack.map((tech) => (
            <div
              key={tech.category}
              className="rounded-xl border border-border/50 bg-card p-4 transition-colors hover:border-primary/20"
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                {tech.category}
              </p>
              <p className="text-sm text-muted-foreground">{tech.items}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/50">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 p-8 text-center shadow-sm md:p-12">
            <Globe className="mx-auto mb-4 h-10 w-10 text-primary" />
            <h2 className="mb-3 text-2xl font-bold font-headline md:text-3xl">
              Ready to Organize Your Certificates?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Join CertIntel today and let AI turn your certificates into a clear learning roadmap.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2">
                <Link href="/register">
                  Create Free Account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/blog">Read Our Blog</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'CertIntel',
            url: 'https://cert-intel.vercel.app',
            description:
              'AI-powered certificate management and intelligence platform for students and educators.',
            applicationCategory: 'EducationalApplication',
            operatingSystem: 'Web',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
            author: {
              '@type': 'Person',
              name: 'Gurupreetam',
              url: 'https://github.com/gurupreetam9',
            },
          }),
        }}
      />
    </div>
  );
}
