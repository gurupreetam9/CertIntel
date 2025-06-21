'use client';

import Link from 'next/link';
import AppLogo from '@/components/common/AppLogo';
import ProfileDropdown from '@/components/home/ProfileDropdown';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function SiteHeader() {
  const { user, userProfile } = useAuth(); // Get userProfile from context

  return (
    <TooltipProvider>
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
              <>
                {/* Button for medium screens and up */}
                <Button variant="ghost" asChild size="sm" className="hidden md:flex">
                  <Link href="/admin/dashboard">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Admin Dashboard
                  </Link>
                </Button>
                {/* Icon-only button for mobile screens with Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" asChild size="icon" className="md:hidden">
                      <Link href="/admin/dashboard" aria-label="Admin Dashboard">
                        <LayoutDashboard className="h-5 w-5" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Admin Dashboard</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            {user && <ProfileDropdown />}
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
