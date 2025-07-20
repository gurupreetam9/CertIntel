
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { onAuthStateChanged as firebaseOnAuthStateChanged, signOut } from '@/lib/firebase/auth';
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
      if (profileListenerUnsubscribe) {
        profileListenerUnsubscribe();
        profileListenerUnsubscribe = undefined;
      }
      
      if (firebaseUser) {
        setUser(firebaseUser);
        setUserId(firebaseUser.uid);

        const userDocRef = doc(firestore, USERS_COLLECTION, firebaseUser.uid);
        profileListenerUnsubscribe = onSnapshot(userDocRef, 
          (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data() as UserProfile);
            } else {
              // This is the critical part: Profile doesn't exist.
              // This can happen if the account was deleted from another device.
              // Force a sign-out on this client to clear the stale auth session.
              console.warn(`AuthContext: User is authenticated (UID: ${firebaseUser.uid}) but their Firestore profile document does not exist. Forcing sign-out.`);
              setUserProfile(null);
              signOut(); // This will trigger the `onAuthStateChanged` listener again, cleaning up state.
            }
            setLoading(false);
          },
          (error) => {
            console.error("AuthContext Snapshot Error:", error);
            setUserProfile(null);
            setLoading(false);
          }
        );
      } else {
        // User is logged out. Clear all state.
        setUser(null);
        setUserId(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileListenerUnsubscribe) {
        profileListenerUnsubscribe();
      }
    };
  }, []);

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
