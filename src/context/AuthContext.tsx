'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode } from 'react';
import { onAuthStateChanged } from '@/lib/firebase/auth';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userId: string | null;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  userId: null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, userId }}>
      {children}
    </AuthContext.Provider>
  );
};
