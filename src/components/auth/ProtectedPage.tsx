
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until loading is false to make a decision
    if (!loading && !user) {
      // If auth state is resolved and there's no user, redirect to login
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    // Show a loader while we are determining auth state, or while redirecting.
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If loading is false and user exists, render the protected content
  return <>{children}</>;
}
