
'use server';
/**
 * @fileOverview Flow to verify an email OTP and complete user registration.
 * - verifyEmailOtpAndRegister: Verifies OTP, and if valid, creates user in Firebase Auth.
 * - VerifyEmailOtpAndRegisterInputSchema: Input schema (email, otp, password).
 * - VerifyEmailOtpAndRegisterOutputSchema: Output schema (success/message, userId).
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod'; // Using global Zod
import { signUp as firebaseSignUp } from '@/lib/firebase/auth';
import type { User, AuthError } from 'firebase/auth';

// HACK: In-memory store for OTPs. NOT SUITABLE FOR PRODUCTION.
// Ensure this accesses the same shared store as in initiate-email-otp.ts for the dev server environment.
if (!(globalThis as any).otpStore) {
  (globalThis as any).otpStore = {};
}
const otpStore: Record<string, { otp: string; expiresAt: number }> = (globalThis as any).otpStore;


export const VerifyEmailOtpAndRegisterInputSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long.' }),
});
export type VerifyEmailOtpAndRegisterInput = z.infer<typeof VerifyEmailOtpAndRegisterInputSchema>;

export const VerifyEmailOtpAndRegisterOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userId: z.string().optional(),
});
export type VerifyEmailOtpAndRegisterOutput = z.infer<typeof VerifyEmailOtpAndRegisterOutputSchema>;

// Exported wrapper function
export async function verifyEmailOtpAndRegister(input: VerifyEmailOtpAndRegisterInput): Promise<VerifyEmailOtpAndRegisterOutput> {
  return verifyEmailOtpAndRegisterFlow(input);
}

const verifyEmailOtpAndRegisterFlow = ai.defineFlow(
  {
    name: 'verifyEmailOtpAndRegisterFlow',
    inputSchema: VerifyEmailOtpAndRegisterInputSchema,
    outputSchema: VerifyEmailOtpAndRegisterOutputSchema,
  },
  async ({ email, otp, password }) => {
    const storedEntry = otpStore[email];

    if (!storedEntry) {
      return { success: false, message: 'OTP not found. It might have expired or was never generated. Please request a new OTP.' };
    }

    if (Date.now() > storedEntry.expiresAt) {
      delete otpStore[email]; // Clean up expired OTP
      return { success: false, message: 'OTP has expired. Please request a new OTP.' };
    }

    if (storedEntry.otp !== otp) {
      // Consider adding a retry limit in a real application
      return { success: false, message: 'Invalid OTP. Please try again.' };
    }

    // OTP is valid, proceed with Firebase user creation
    const result: User | AuthError = await firebaseSignUp({ email, password });

    if ('code' in result) { // AuthError
      const firebaseError = result as AuthError;
      let errorMessage = 'Registration failed. Please try again.';
      if (firebaseError.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
      } else if (firebaseError.message) {
        errorMessage = firebaseError.message;
      }
      return { success: false, message: errorMessage };
    } else { // User is an object, registration successful
      delete otpStore[email]; // Important: Clean up OTP after successful registration
      return { success: true, message: 'Registration successful! Welcome to ImageVerse!', userId: result.uid };
    }
  }
);
