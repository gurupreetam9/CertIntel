
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { onAuthStateChanged as firebaseOnAuthStateChanged } from '@/lib/firebase/auth';
import { firestore } from '@/lib/firebase/config';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { UserProfile } from '@/lib/models/user';
import { Loader2 } from 'lucide-react';

const AWAITING_2FA_USER_KEY = 'awaiting2faUserEmail';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  userId: string | null;
  isAwaiting2FA: boolean;
  setIsAwaiting2FA: (email: string | null) => void; // Can be email or null
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAwaiting2FA, setisAwaiting2FAState] = useState(false);

  const setIsAwaiting2FA = (email: string | null) => {
    if (typeof window !== 'undefined') {
        if (email) {
            localStorage.setItem(AWAITING_2FA_USER_KEY, email);
            setisAwaiting2FAState(true);
        } else {
            localStorage.removeItem(AWAITING_2FA_USER_KEY);
            setisAwaiting2FAState(false);
        }
    }
  };


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
      
      const awaiting2faEmail = typeof window !== 'undefined' ? localStorage.getItem(AWAITING_2FA_USER_KEY) : null;

      if (firebaseUser) {
        // If a user is logged into Firebase AND their email matches the one in localStorage waiting for 2FA,
        // then we must treat them as being in an "awaiting 2FA" state.
        if (awaiting2faEmail && firebaseUser.email === awaiting2faEmail) {
            setUser(firebaseUser); // Set the user object
            setUserId(firebaseUser.uid); // Set the user ID
            setisAwaiting2FAState(true); // Enforce the 2FA state
            setUserProfile(null); // Do not load profile yet
            setLoading(false); // Stop loading, ProtectedPage will now take over
        } else {
            // This is a normal, fully authenticated user.
            setUser(firebaseUser);
            setUserId(firebaseUser.uid);
            setIsAwaiting2FA(null); // Clear any stale 2FA state from another user

            const userDocRef = doc(firestore, USERS_COLLECTION, firebaseUser.uid);
            profileListenerUnsubscribe = onSnapshot(userDocRef, 
              (docSnap) => {
                setUserProfile(docSnap.exists() ? docSnap.data() as UserProfile : null);
                setLoading(false);
              },
              (error) => {
                console.error("AuthContext Snapshot Error:", error);
                setUserProfile(null);
                setLoading(false);
              }
            );
        }
      } else {
        // User is logged out. Clear all state.
        setUser(null);
        setUserId(null);
        setUserProfile(null);
        setIsAwaiting2FA(null);
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
    <AuthContext.Provider value={{ user, userProfile, loading, userId, isAwaiting2FA, setIsAwaiting2FA, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
