
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { onAuthStateChanged as firebaseOnAuthStateChanged } from '@/lib/firebase/auth'; // Renamed to avoid conflict
import { firestore } from '@/lib/firebase/config'; // Direct import for firestore
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'; // Import onSnapshot and Unsubscribe
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAwaiting2FA, setIsAwaiting2FA] = useState(false);
  
  const refreshUserProfile = useCallback(() => {
    console.log("AuthContext: refreshUserProfile called. (Currently a no-op due to real-time listener, but can be enhanced if needed).");
  }, []);

  useEffect(() => {
    setLoading(true);
    let profileListenerUnsubscribe: Unsubscribe | undefined = undefined;

    console.log("AuthContext: Setting up onAuthStateChanged listener.");
    const authUnsubscribe = firebaseOnAuthStateChanged(async (firebaseUser) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user UID:", firebaseUser ? firebaseUser.uid : 'null');
      
      if (profileListenerUnsubscribe) {
        console.log("AuthContext: Unsubscribing from previous profile listener for UID:", user?.uid);
        profileListenerUnsubscribe();
        profileListenerUnsubscribe = undefined;
      }
      
      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);
      setUserProfile(null); 

      if (firebaseUser) {
        setLoading(true); 
        const userDocRef = doc(firestore, USERS_COLLECTION, firebaseUser.uid);
        console.log("AuthContext: Subscribing to profile snapshots for UID:", firebaseUser.uid);

        profileListenerUnsubscribe = onSnapshot(userDocRef, 
          (docSnap) => {
            if (docSnap.exists()) {
              const newProfile = docSnap.data() as UserProfile;
              setUserProfile(newProfile);
              console.log("AuthContext: User profile updated from snapshot for UID:", firebaseUser.uid, newProfile);
            } else {
              setUserProfile(null);
              console.warn("AuthContext: User profile NOT FOUND in Firestore (onSnapshot for UID:", firebaseUser.uid, ")");
            }
            // Don't set loading to false here if 2FA is pending
            if (!isAwaiting2FA) {
              setLoading(false);
            }
          },
          (error) => {
            console.error("AuthContext: Error listening to user profile (onSnapshot) for UID:", firebaseUser.uid, error);
            setUserProfile(null);
            setLoading(false);
            setIsAwaiting2FA(false);
          }
        );
      } else {
        setUserProfile(null);
        setLoading(false);
        setIsAwaiting2FA(false); // Reset 2FA state on logout
        console.log("AuthContext: No Firebase user. Loading false, profile null, 2FA state reset.");
      }
    });

    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged and any active profile listener.");
      authUnsubscribe();
      if (profileListenerUnsubscribe) {
        profileListenerUnsubscribe();
      }
    };
  }, []); // isAwaiting2FA is intentionally omitted to avoid re-triggering auth listeners on its change

  if (loading && user === undefined) { 
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Initializing App & Checking Authentication...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, userId, isAwaiting2FA, setIsAwaiting2FA, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
