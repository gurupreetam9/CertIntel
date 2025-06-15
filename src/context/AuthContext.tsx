
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
  refreshUserProfile: () => void; // New function to trigger profile refresh
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null, 
  loading: true,
  userId: null,
  refreshUserProfile: () => {}, // Default empty implementation
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); 
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0); // Key to trigger refresh

  const refreshUserProfile = useCallback(() => {
    console.log("AuthContext: refreshUserProfile called. Incrementing key.");
    setProfileRefreshKey(key => key + 1);
  }, []);

  // Hoisted fetchProfile function
  const fetchProfile = useCallback(async (currentFirebaseUser: User) => {
    try {
      console.log("AuthContext: User authenticated (or refresh triggered), attempting to fetch profile for UID:", currentFirebaseUser.uid);
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
      // Only set loading to false on initial load or auth state change (when `loading` is true), 
      // not necessarily every manual refresh if loading was already false.
      if (loading) { 
        console.log("AuthContext: Profile fetch attempt complete (initial/auth change). Setting loading to false.");
        setLoading(false);
      } else {
        console.log("AuthContext: Profile fetch attempt complete (manual refresh). Loading state remains as is if it was already false.");
      }
    }
  }, [loading, setLoading, setUserProfile]); // Added dependencies for useCallback


  useEffect(() => {
    // This effect handles manual profile refreshes triggered by refreshUserProfile()
    if (user && userId) { 
      console.log(`AuthContext: useEffect for profileRefreshKey (${profileRefreshKey}) triggered. User ID: ${userId}. Fetching profile.`);
      // For manual refresh, we might want to show a loader briefly.
      // If loading is already false, and we want to show a loader, set it true here.
      if (!loading) setLoading(true); 
      fetchProfile(user).finally(() => {
        // Ensure loading is set to false after a manual refresh completes,
        // especially if it was set to true at the start of this effect.
        if (loading) setLoading(false); 
      });
    }
  }, [profileRefreshKey, user, userId, fetchProfile, loading, setLoading]); // Added loading and setLoading to dependencies

  useEffect(() => {
    // This effect handles the initial auth state and subsequent auth changes.
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (!loading) setLoading(true); // Always set loading true when auth state might change
      console.log("AuthContext: onAuthStateChanged triggered. Firebase user:", firebaseUser ? firebaseUser.uid : 'null');
      setUser(firebaseUser);
      setUserId(firebaseUser ? firebaseUser.uid : null);

      if (firebaseUser) {
        await fetchProfile(firebaseUser); // This will also handle setting loading to false in its finally block
      } else {
        setUserProfile(null);
        console.log("AuthContext: No Firebase user. Setting loading to false.");
        if (loading) setLoading(false); // Ensure loading is false if no user
      }
    });

    return () => {
      console.log("AuthContext: Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    };
  }, [fetchProfile, loading, setLoading]); // Corrected dependencies, removed []

  if (loading && !userProfile && !user) { // More specific condition for initial global loader
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
