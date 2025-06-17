
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updateProfile,
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
      // Return a generic message for security to avoid confirming/denying email existence.
      console.log(`sendPasswordReset: No user profile found in Firestore for email: ${email}. Not proceeding with Firebase Auth password reset.`);
      return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };
    }

    // User profile exists in Firestore, proceed to request password reset from Firebase Auth
    console.log(`sendPasswordReset: User profile found in Firestore for email: ${email}. Proceeding with Firebase Auth password reset.`);
    await firebaseSendPasswordResetEmail(auth, email);
    return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };

  } catch (error: any) {
    const authError = error as AuthError;
    console.error("sendPasswordResetEmail error:", authError.code, authError.message);
    // For security, always return a generic success message, even on Firebase Auth errors,
    // unless it's a clear client-side validation issue like invalid email format (though Zod handles that earlier).
    // This prevents attackers from enumerating emails registered with Firebase Auth if they bypass our Firestore check somehow.
    if (authError.code === 'auth/invalid-email') {
      // This case might be redundant if Zod schema validation on the form already catches it.
      return { success: false, message: 'The email address is not valid.' };
    }
    // For all other errors (including 'auth/user-not-found' from Firebase Auth, which we now expect if the Firestore check passed but Auth differs),
    // return the generic message.
    return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };
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
