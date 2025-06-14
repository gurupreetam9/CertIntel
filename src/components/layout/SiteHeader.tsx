
'use client';

import Link from 'next/link';
import AppLogo from '@/components/common/AppLogo';
import ProfileDropdown from '@/components/home/ProfileDropdown';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard } from 'lucide-react';

export default function SiteHeader() {
  const { user, userProfile } = useAuth(); // Get userProfile from context

  return (
    <header 
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ '--header-height': '4rem' } as React.CSSProperties}
    >
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <Link href="/" aria-label="CertIntel Home" className="mr-auto">
          <AppLogo size={7} />
        </Link>
        
        <div className="flex items-center gap-2">
          {user && userProfile?.role === 'admin' && (
            <Button variant="ghost" asChild size="sm">
              <Link href="/admin/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Admin Dashboard
              </Link>
            </Button>
          )}
          {user && <ProfileDropdown />}
        </div>
      </div>
    </header>
  );
}
