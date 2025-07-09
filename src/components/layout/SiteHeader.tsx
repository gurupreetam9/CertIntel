
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
import { getStudentLinkRequestsForAdminRealtime } from '@/lib/services/userService';

export default function SiteHeader() {
  const { user, userProfile, isAwaiting2FA } = useAuth(); // Added isAwaiting2FA
  const [isDashboardTooltipOpen, setIsDashboardTooltipOpen] = useState(false);
  const [hasPendingRequests, setHasPendingRequests] = useState(false);

  // Effect to show tooltip on admin login
  useEffect(() => {
    if (typeof window !== 'undefined' && user && userProfile?.role === 'admin') {
      const tooltipShown = sessionStorage.getItem('adminDashboardTooltipShown');
      if (!tooltipShown) {
        setIsDashboardTooltipOpen(true);
        sessionStorage.setItem('adminDashboardTooltipShown', 'true');
        const timer = setTimeout(() => setIsDashboardTooltipOpen(false), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [user, userProfile]);

  // Effect to listen for pending link requests for the admin
  useEffect(() => {
    if (user && userProfile?.role === 'admin' && !isAwaiting2FA) { // Only listen if fully authenticated
      const unsubscribe = getStudentLinkRequestsForAdminRealtime(
        user.uid,
        (requests) => {
          setHasPendingRequests(requests.length > 0);
        },
        (error) => {
          console.error("SiteHeader: Error fetching pending requests for notification:", error);
          setHasPendingRequests(false);
        }
      );
      return () => unsubscribe();
    }
  }, [user, userProfile, isAwaiting2FA]);


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
            {user && !isAwaiting2FA ? ( // Condition to check if user is fully authenticated
              <>
                {userProfile?.role === 'admin' && (
                  <>
                    {/* Button for medium screens and up */}
                    <Button variant="ghost" asChild size="sm" className="hidden md:flex relative">
                      <Link href="/admin/dashboard">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Admin Dashboard
                        {hasPendingRequests && (
                          <span className="absolute top-1 right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                          </span>
                        )}
                      </Link>
                    </Button>
                    {/* Icon-only button for mobile screens with Tooltip */}
                    <Tooltip open={isDashboardTooltipOpen} onOpenChange={setIsDashboardTooltipOpen}>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" asChild size="icon" className="md:hidden relative">
                          <Link href="/admin/dashboard" aria-label="Admin Dashboard">
                            <LayoutDashboard className="h-5 w-5" />
                            {hasPendingRequests && (
                              <span className="absolute top-1 right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                              </span>
                            )}
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-primary text-primary-foreground border-transparent">
                        <p>Admin Dashboard {hasPendingRequests && <span className="text-accent-foreground/80">(New Requests)</span>}</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                <ProfileDropdown />
              </>
            ) : user && isAwaiting2FA ? (
              // Optionally show something specific while awaiting 2FA, or nothing
              null
            ) : (
               <Button asChild variant="outline">
                  <Link href="/login">Login / Register</Link>
               </Button>
            )}
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
