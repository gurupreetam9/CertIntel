
'use client';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updateProfile,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  type User,
  type AuthError,
} from 'firebase/auth';
import { auth, firestore } from './config'; // Import firestore instance
import type { SignInFormValues, SignUpFormValues } from '@/types/auth';
import { collection, query, where, getDocs, limit } from 'firebase/firestore'; // Firestore query functions

export const signUp = async ({ email, password }: SignUpFormValues): Promise<User | AuthError> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    return error as AuthError;
  }
};

export const signIn = async ({ email, password }: SignInFormValues): Promise<User | AuthError> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    return error as AuthError;
  }
};

export const signOut = async (): Promise<void | AuthError> => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    return error as AuthError;
  }
};

export const signInWithCustomToken = async (token: string): Promise<User | AuthError> => {
    try {
        const userCredential = await firebaseSignInWithCustomToken(auth, token);
        return userCredential.user;
    } catch (error) {
        return error as AuthError;
    }
};


export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

export const sendPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
  try {
    // First, check if a user profile exists in Firestore with this email
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('email', '==', email), limit(1));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      // No user profile found in our Firestore database for this email.
      console.log(`sendPasswordReset: No user profile found in Firestore for email: ${email}.`);
      return { success: false, message: 'No account found with that email address. Please check your email or register for an account.' };
    }

    // User profile exists in Firestore, proceed to request password reset from Firebase Auth
    console.log(`sendPasswordReset: User profile found in Firestore for email: ${email}. Proceeding with Firebase Auth password reset.`);
    await firebaseSendPasswordResetEmail(auth, email);
    // Even if user exists in Firestore, Firebase Auth might not have this user (e.g. data inconsistency).
    // However, sendPasswordResetEmail itself doesn't error for non-existent users in Auth to prevent enumeration.
    // So, we return a generic success message here to maintain that security aspect from Auth's perspective.
    return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };

  } catch (error: any) {
    const authError = error as AuthError;
    console.error("sendPasswordResetEmail error:", authError.code, authError.message);
    // This catch block is for unexpected errors from Firebase Auth (e.g., network, service unavailable).
    // auth/invalid-email should be caught by Zod validation on the client.
    if (authError.code === 'auth/invalid-email') {
      return { success: false, message: 'The email address is not valid.' };
    }
    // For other errors, return a generic failure message.
    return { success: false, message: 'Failed to send password reset email. Please try again later.' };
  }
};

export const updateUserProfileName = async (displayName: string): Promise<{ success: boolean; message?: string }> => {
  if (!auth.currentUser) {
    return { success: false, message: 'No user is currently signed in.' };
  }
  try {
    await updateProfile(auth.currentUser, { displayName });
    return { success: true };
  } catch (error: any) {
    const authError = error as AuthError;
    console.error("updateUserProfileName error:", authError.code, authError.message);
    return { success: false, message: authError.message || 'Failed to update display name.' };
  }
};
