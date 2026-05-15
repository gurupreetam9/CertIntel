
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/hooks/themeContextManager.tsx'; // Explicitly import .tsx
import { Toaster } from '@/components/ui/toaster';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';

export const metadata: Metadata = {
  metadataBase: new URL('https://cert-intel.vercel.app'),
  title: 'CertIntel - AI Certificate Analysis & Course Recommendation Platform',
  description:
    'CertIntel is an AI-powered certificate analysis platform that uses YOLOv8 OCR, NLP, and recommendation systems to extract course information and recommend personalized learning paths.',
  keywords: [
    'CertIntel',
    'YOLOv8',
    'OCR',
    'Certificate Analysis',
    'AI Recommendation System',
    'Course Recommendation',
    'NLP',
    'Computer Vision',
    'Learning Path Recommendation',
    'AI Education Platform',
  ],
  openGraph: {
    title: 'CertIntel',
    description:
      'AI-powered certificate analysis and recommendation platform using YOLOv8 OCR and NLP.',
    url: 'https://cert-intel.vercel.app',
    siteName: 'CertIntel',
    type: 'website',
  },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          <ThemeProvider>
            <div className="flex flex-col min-h-screen">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
