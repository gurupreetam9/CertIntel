import Link from 'next/link';
import AppLogo from '@/components/common/AppLogo';
import { Github } from 'lucide-react';

export default function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 bg-card/30">
      <div className="container mx-auto px-4 py-10 md:py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" aria-label="CertIntel Home" className="inline-block mb-3">
              <AppLogo size={6} />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              AI-powered certificate management and intelligence platform for students and
              educators.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="mb-3 text-sm font-semibold font-headline text-foreground">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-muted-foreground transition-colors hover:text-primary">
                  About
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-muted-foreground transition-colors hover:text-primary">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-muted-foreground transition-colors hover:text-primary">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-muted-foreground transition-colors hover:text-primary">
                  Register
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="mb-3 text-sm font-semibold font-headline text-foreground">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/gurupreetam9/CertIntel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
                >
                  <Github className="h-3.5 w-3.5" />
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://huggingface.co/spaces/GuruPreetam/CertIntel-Flask-Server"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  AI Server (Hugging Face)
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-3 text-sm font-semibold font-headline text-foreground">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/gurupreetam9/CertIntel/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  License (PolyForm NC)
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border/50 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {currentYear} CertIntel. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built with ❤️ by{' '}
            <a
              href="https://github.com/gurupreetam9"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              Gurupreetam
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
