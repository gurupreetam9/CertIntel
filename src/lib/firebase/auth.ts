
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updateProfile, // Import updateProfile
  type User,
  type AuthError,
} from 'firebase/auth';
import { auth } from './config';
import type { SignInFormValues, SignUpFormValues } from '@/types/auth';

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

export const onAuthStateChanged = (callback: (user: User | null) => void) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

export const sendPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
  try {
    await firebaseSendPasswordResetEmail(auth, email);
    return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };
  } catch (error: any) {
    const authError = error as AuthError;
    console.error("sendPasswordResetEmail error:", authError.code, authError.message);
    if (authError.code === 'auth/invalid-email') {
      return { success: false, message: 'The email address is not valid.' };
    }
    // For other errors, still give a somewhat generic message for security.
    return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };
  }
};

// New function to update display name
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
