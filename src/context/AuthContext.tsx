
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
  isAwaiting2FA: boolean; // NEW: Track if user is in the middle of 2FA
  setIsAwaiting2FA: (isAwaiting: boolean) => void; // NEW: Function to set the 2FA state
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

  const setIsAwaiting2FA = (isAwaiting: boolean) => {
    setisAwaiting2FAState(isAwaiting);
    if (typeof window !== 'undefined') {
        if (isAwaiting) {
            sessionStorage.setItem('isAwaiting2FA', 'true');
        } else {
            sessionStorage.removeItem('isAwaiting2FA');
        }
    }
  };

  const refreshUserProfile = useCallback(() => {
    console.log("AuthContext: refreshUserProfile called. (Currently a no-op due to real-time listener, but can be enhanced if needed).");
  }, []);

  useEffect(() => {
    let profileListenerUnsubscribe: Unsubscribe | undefined = undefined;
    
    // Check sessionStorage for persisted 2FA state on initial load
    const isAwaitingFromSession = typeof window !== 'undefined' && sessionStorage.getItem('isAwaiting2FA') === 'true';
    if(isAwaitingFromSession) {
        setisAwaiting2FAState(true);
    }

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
            setUserProfile(docSnap.exists() ? docSnap.data() as UserProfile : null);
            setLoading(false);
          },
          (error) => {
            console.error("AuthContext Snapshot Error:", error);
            setUserProfile(null);
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setUserId(null);
        setUserProfile(null);
        setIsAwaiting2FA(false); // Clear 2FA state on logout
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

  if (loading && !isAwaiting2FA) { // Don't show global loader if we are just waiting for 2FA input
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
