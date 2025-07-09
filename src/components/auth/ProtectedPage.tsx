
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading, isAwaiting2FA } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth state is resolved and user is not logged in OR is still awaiting 2FA,
    // redirect them to the login page.
    if (!loading && (!user || isAwaiting2FA)) {
      router.replace('/login');
    }
  }, [user, loading, isAwaiting2FA, router]);

  // Show a loader while determining auth state, or if user is in an unauthenticated state (and will be redirected).
  if (loading || !user || isAwaiting2FA) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If loading is false, user exists, and is NOT awaiting 2FA, render the protected content
  return <>{children}</>;
}
