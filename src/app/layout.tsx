
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/hooks/useTheme'; // Updated import
import { Toaster } from '@/components/ui/toaster';
import SiteHeader from '@/components/layout/SiteHeader';

export const metadata: Metadata = {
  title: 'ImageVerse',
  description: 'Upload, manage, and enhance your images with AI.',
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
          <ThemeProvider> {/* Wrap with ThemeProvider */}
            <div className="flex flex-col min-h-screen">
              <SiteHeader />
              <main className="flex-1">{children}</main>
            </div>
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
