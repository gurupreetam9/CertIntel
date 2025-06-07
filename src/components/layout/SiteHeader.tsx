'use client';

import Link from 'next/link';
import AppLogo from '@/components/common/AppLogo';
import ProfileDropdown from '@/components/home/ProfileDropdown';
import { useAuth } from '@/hooks/useAuth';

export default function SiteHeader() {
  const { user } = useAuth();

  return (
    <header 
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ '--header-height': '4rem' } as React.CSSProperties}
    >
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <Link href="/" aria-label="ImageVerse Home">
          <AppLogo size={7} />
        </Link>
        {user && <ProfileDropdown />}
      </div>
    </header>
  );
}
