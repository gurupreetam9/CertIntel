
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode } from 'react';
import { onAuthStateChanged } from '@/lib/firebase/auth';
import { getUserProfile } from '@/lib/services/userService'; // Import userService
import type { UserProfile } from '@/lib/models/user'; // Import UserProfile model
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null; // Add userProfile to context
  loading: boolean;
  userId: string | null;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null, // Initialize userProfile
  loading: true,
  userId: null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // State for userProfile
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      setLoading(true);
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser ? firebaseUser.uid : 'null');
      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);

      if (firebaseUser) {
        try {
          console.log("AuthContext: User authenticated, attempting to fetch profile for UID:", firebaseUser.uid);
          const profile = await getUserProfile(firebaseUser.uid);
          setUserProfile(profile);
          if (!profile) {
            console.warn("AuthContext: User profile NOT FOUND in Firestore for UID:", firebaseUser.uid, ". This might be expected for a new user immediately after registration (before profile document is created) or it could indicate an issue if the profile should exist.");
          } else {
            console.log("AuthContext: User profile fetched successfully:", profile);
          }
        } catch (error: any) {
          console.error("AuthContext: CRITICAL ERROR fetching user profile. This often indicates Firestore is offline for the client, misconfigured, or there are permission issues. Error message:", error.message, "Error object:", error);
          setUserProfile(null); 
          // Consider setting a global error state here to inform the user more directly about the problem.
        } finally {
          console.log("AuthContext: Profile fetch attempt complete. Setting loading to false.");
          setLoading(false);
        }
      } else {
        // No Firebase user, so no profile to fetch.
        setUserProfile(null);
        console.log("AuthContext: No Firebase user. Setting loading to false.");
        setLoading(false);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Initializing App & Checking Authentication...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, userId }}>
      {children}
    </AuthContext.Provider>
  );
};
