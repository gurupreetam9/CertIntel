
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
import { useState, useEffect } from 'react';

export default function SiteHeader() {
  const { user, userProfile } = useAuth();
  const [isDashboardTooltipOpen, setIsDashboardTooltipOpen] = useState(false);

  // Effect to show tooltip on admin login
  useEffect(() => {
    // Only run on the client where sessionStorage is available
    if (typeof window !== 'undefined' && user && userProfile?.role === 'admin') {
      const tooltipShown = sessionStorage.getItem('adminDashboardTooltipShown');
      if (!tooltipShown) {
        // If the tooltip hasn't been shown in this session, show it.
        setIsDashboardTooltipOpen(true);
        sessionStorage.setItem('adminDashboardTooltipShown', 'true');

        // Hide it after 5 seconds
        const timer = setTimeout(() => {
          setIsDashboardTooltipOpen(false);
        }, 5000);

        // Cleanup timer on component unmount or if dependencies change
        return () => clearTimeout(timer);
      }
    }
  }, [user, userProfile]);

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
                <Tooltip open={isDashboardTooltipOpen} onOpenChange={setIsDashboardTooltipOpen}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" asChild size="icon" className="md:hidden">
                      <Link href="/admin/dashboard" aria-label="Admin Dashboard">
                        <LayoutDashboard className="h-5 w-5" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-primary text-primary-foreground border-transparent">
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
