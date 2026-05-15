
import type { Metadata } from 'next';
import { Open_Sans, Poppins } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/hooks/themeContextManager.tsx'; // Explicitly import .tsx
import { Toaster } from '@/components/ui/toaster';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-open-sans',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

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
    <html lang="en" className={`${openSans.variable} ${poppins.variable}`} suppressHydrationWarning>
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
