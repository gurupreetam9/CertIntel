
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
      // Set loading to true at the very start of processing an auth state change.
      setLoading(true);
      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);

      if (firebaseUser) {
        try {
          console.log("AuthContext: User authenticated, fetching profile for UID:", firebaseUser.uid);
          const profile = await getUserProfile(firebaseUser.uid);
          setUserProfile(profile);
          if (!profile) {
            console.warn("AuthContext: User profile not found in Firestore for UID:", firebaseUser.uid, "This might be expected for a new user pre-profile creation, or indicate an issue if profile should exist.");
          } else {
            console.log("AuthContext: User profile fetched successfully:", profile);
          }
        } catch (error) {
          // This is a critical point. If "client is offline" happens here, it means Firestore is not reachable.
          console.error("AuthContext: CRITICAL - Failed to fetch user profile. This could be due to Firestore being offline, misconfigured, or permission issues. Error:", error);
          setUserProfile(null); 
          // Consider setting a global error state here to inform the user more directly.
        } finally {
          // Set loading to false only after all async operations (profile fetching) are complete.
          console.log("AuthContext: Finished processing auth state and profile fetch attempt. Setting loading to false.");
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
  }, []); // Empty dependency array ensures this runs only once on mount and unmount.

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

