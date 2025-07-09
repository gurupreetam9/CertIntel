
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { onAuthStateChanged as firebaseOnAuthStateChanged } from '@/lib/firebase/auth';
import { firestore } from '@/lib/firebase/config';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { UserProfile } from '@/lib/models/user';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  userId: string | null;
  refreshUserProfile: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  userId: null,
  refreshUserProfile: () => {},
});

const USERS_COLLECTION = 'users';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const refreshUserProfile = useCallback(() => {
    console.log("AuthContext: refreshUserProfile called. (Currently a no-op due to real-time listener, but can be enhanced if needed).");
  }, []);

  useEffect(() => {
    let profileListenerUnsubscribe: Unsubscribe | undefined = undefined;

    const authUnsubscribe = firebaseOnAuthStateChanged((firebaseUser) => {
      // Always clean up the old profile listener when the auth state changes
      if (profileListenerUnsubscribe) {
        profileListenerUnsubscribe();
        profileListenerUnsubscribe = undefined;
      }
      
      if (firebaseUser) {
        setLoading(true); // Start loading whenever a user is detected
        setUser(firebaseUser);
        setUserId(firebaseUser.uid);
        
        const userDocRef = doc(firestore, USERS_COLLECTION, firebaseUser.uid);
        profileListenerUnsubscribe = onSnapshot(userDocRef, 
          (docSnap) => {
            setUserProfile(docSnap.exists() ? docSnap.data() as UserProfile : null);
            // Now that we have user and profile info, we can definitively stop loading
            setLoading(false);
          },
          (error) => {
            console.error("AuthContext Snapshot Error:", error);
            setUserProfile(null);
            setLoading(false); // Stop loading on error too
          }
        );
      } else {
        // No user is logged in. Reset all user-specific state.
        setUser(null);
        setUserId(null);
        setUserProfile(null);
        setLoading(false); // Definitive state: not logged in
      }
    });

    // Cleanup function for the main auth listener
    return () => {
      authUnsubscribe();
      if (profileListenerUnsubscribe) {
        profileListenerUnsubscribe();
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, userId, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
