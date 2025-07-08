
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading, isAwaiting2FA } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // If not logged in at all, redirect to login.
        router.replace('/login');
      } else if (isAwaiting2FA && pathname !== '/login') {
        // If logged in but 2FA is pending and user is not on the login page,
        // force them back to complete authentication.
        router.replace('/login');
      }
    }
  }, [user, loading, router, isAwaiting2FA, pathname]);

  if (loading || !user || (isAwaiting2FA && pathname !== '/login')) {
    // Show loader if:
    // 1. Auth state is loading.
    // 2. User is not logged in (while redirecting).
    // 3. 2FA is pending and user is not on the login page (while redirecting).
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
