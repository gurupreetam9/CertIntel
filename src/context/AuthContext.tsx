
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, useRef, type ReactNode, useCallback } from 'react';
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

        // Set session cookie for authenticated image access (img src, window.open)
        firebaseUser.getIdToken().then(token => {
          document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Lax`;
        }).catch(err => console.warn('AuthContext: Failed to set session cookie:', err.message));

        const userDocRef = doc(firestore, USERS_COLLECTION, firebaseUser.uid);
        profileListenerUnsubscribe = onSnapshot(userDocRef, 
          (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data() as UserProfile);
            } else {
              // This is the critical part: Profile doesn't exist.
              // This can happen if the account was deleted from another device
              // OR if the user just registered and the backend API hasn't 
              // finished creating the profile document yet.
              const creationTimeStr = firebaseUser.metadata.creationTime;
              if (creationTimeStr) {
                  const creationTime = new Date(creationTimeStr).getTime();
                  const ageMs = Date.now() - creationTime;
                  // Allow up to 2 minutes for profile creation during signup
                  if (ageMs < 2 * 60 * 1000) {
                      console.log(`AuthContext: Profile for new user ${firebaseUser.uid} not yet ready. Waiting...`);
                      setUserProfile(null);
                      return;
                  }
              }

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
        // Clear session cookie
        document.cookie = '__session=; path=/; max-age=0; SameSite=Lax';
      }
    });

    return () => {
      authUnsubscribe();
      if (profileListenerUnsubscribe) {
        profileListenerUnsubscribe();
      }
    };
  }, []);

  // Refresh session cookie every 10 minutes to stay ahead of Firebase's 1-hour token expiry
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      user.getIdToken(true).then(token => {
        document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Lax`;
      }).catch(() => {});
    }, 10 * 60 * 1000); // every 10 minutes
    return () => clearInterval(interval);
  }, [user]);

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
