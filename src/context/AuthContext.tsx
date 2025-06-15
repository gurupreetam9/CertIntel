
'use client';

import type { User } from 'firebase/auth';
import { createContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import { onAuthStateChanged } from '@/lib/firebase/auth';
import { getUserProfile } from '@/lib/services/userService';
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  const refreshUserProfile = useCallback(() => {
    console.log("AuthContext: refreshUserProfile called. Incrementing key.");
    setProfileRefreshKey(key => key + 1);
  }, []);

  const fetchProfile = useCallback(async (currentFirebaseUser: User) => {
    console.log("AuthContext: fetchProfile invoked for UID:", currentFirebaseUser.uid);
    try {
      const profile = await getUserProfile(currentFirebaseUser.uid);
      setUserProfile(profile);
      if (!profile) {
        console.warn("AuthContext: User profile NOT FOUND in Firestore for UID:", currentFirebaseUser.uid);
      } else {
        console.log("AuthContext: User profile fetched successfully:", profile);
      }
    } catch (error: any) {
      console.error("AuthContext: CRITICAL ERROR fetching user profile. Error message:", error.message, error);
      setUserProfile(null);
    } finally {
      console.log("AuthContext: fetchProfile finished for UID:", currentFirebaseUser.uid, ". Setting loading to false.");
      setLoading(false);
    }
  }, [setLoading, setUserProfile]); // Dependencies for fetchProfile

  useEffect(() => {
    // Effect for manual profile refreshes
    if (user && userId && profileRefreshKey > 0) { // Check profileRefreshKey > 0 to avoid running on initial mount if user is already set
      console.log(`AuthContext: Manual profile refresh triggered (key: ${profileRefreshKey}) for User ID: ${userId}. Setting loading true.`);
      setLoading(true);
      fetchProfile(user);
    }
  }, [profileRefreshKey, user, userId, fetchProfile]); // Removed setLoading from here as fetchProfile handles it

  useEffect(() => {
    // Effect for initial auth state and subsequent auth changes
    console.log("AuthContext: Setting up onAuthStateChanged listener.");
    setLoading(true); // Start with loading true when this effect runs

    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user UID:", firebaseUser ? firebaseUser.uid : 'null');
      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);

      if (firebaseUser) {
        // If user is authenticated, set loading to true before fetching profile
        // fetchProfile will set it to false in its finally block
        if(!loading) setLoading(true); // Ensure loading is true if it wasn't already
        await fetchProfile(firebaseUser);
      } else {
        setUserProfile(null);
        console.log("AuthContext: No Firebase user. Setting loading to false.");
        setLoading(false); // Explicitly set loading to false if no user
      }
    });

    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    };
  }, [fetchProfile]); // Removed loading and setLoading from dependencies as they are managed internally or by fetchProfile

  // This global loader is for the very initial app shell loading.
  // ProtectedPage and individual pages will handle their own loading states once user/userProfile context is available.
  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Initializing App & Checking Authentication...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, userId, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
