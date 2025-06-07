
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
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
    // Firebase typically doesn't reveal if an email exists for security reasons during password reset.
    // So, even on errors like 'auth/user-not-found', we give a generic success message.
    // However, for development or specific known client-side errors (like invalid email format before sending), you might handle differently.
    // For this implementation, we'll return a generic success message to avoid account enumeration.
    // Specific client-side validation (like Zod for email format) should catch format errors before this call.
     if (authError.code === 'auth/invalid-email') {
      return { success: false, message: 'The email address is not valid.' };
    }
    // For other errors, still give a somewhat generic message for security.
    return { success: true, message: 'If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).' };
  }
};
