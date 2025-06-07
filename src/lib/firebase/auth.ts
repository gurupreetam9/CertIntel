import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
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
