
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth state is resolved and user is not logged in, redirect.
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // Show a loader while determining auth state or if user is null (and will be redirected).
  if (loading || !user) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If loading is false and user exists, render the protected content.
  return <>{children}</>;
}
