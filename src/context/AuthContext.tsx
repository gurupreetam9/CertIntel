
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
  isAwaiting2FA: boolean;
  setIsAwaiting2FA: (isAwaiting: boolean) => void;
  refreshUserProfile: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  userId: null,
  isAwaiting2FA: false,
  setIsAwaiting2FA: () => {},
  refreshUserProfile: () => {},
});

const USERS_COLLECTION = 'users';
const AWAITING_2FA_SESSION_KEY = 'certintel-awaiting-2fa';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize state from sessionStorage to persist across refreshes
  const [isAwaiting2FA, _setIsAwaiting2FA] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.sessionStorage.getItem(AWAITING_2FA_SESSION_KEY) === 'true';
  });

  // Create a stable setter that updates both React state and sessionStorage
  const setIsAwaiting2FA = useCallback((isAwaiting: boolean) => {
    _setIsAwaiting2FA(isAwaiting);
    if (typeof window !== 'undefined') {
      if (isAwaiting) {
        window.sessionStorage.setItem(AWAITING_2FA_SESSION_KEY, 'true');
      } else {
        window.sessionStorage.removeItem(AWAITING_2FA_SESSION_KEY);
      }
    }
  }, []);

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
        // No user is logged in. Reset everything.
        setUser(null);
        setUserId(null);
        setUserProfile(null);
        setIsAwaiting2FA(false); // This will clear the session storage
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
  }, [setIsAwaiting2FA]); // Only depends on the stable setIsAwaiting2FA setter

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, userId, isAwaiting2FA, setIsAwaiting2FA, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
