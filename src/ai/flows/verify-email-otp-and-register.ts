
'use server';
/**
 * @fileOverview Flow to verify an email OTP and complete user registration for Admin or Student.
 * - verifyEmailOtpAndRegister: Verifies OTP, creates Firebase user, and Firestore profiles/requests.
 * - VerifyEmailOtpAndRegisterInput: Input type.
 * - VerifyEmailOtpAndRegisterOutput: Output type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { signUp as firebaseSignUp } from '@/lib/firebase/auth';
import { 
  createAdminProfile, 
  createUserProfileDocument,
  createStudentLinkRequest,
  getAdminByUniqueId
} from '@/lib/services/userService';
import type { User, AuthError } from 'firebase/auth';
import type { UserRole } from '@/lib/models/user';

// HACK: In-memory store for OTPs. NOT SUITABLE FOR PRODUCTION.
if (!(globalThis as any).otpStore) {
  (globalThis as any).otpStore = {};
}
const otpStore: Record<string, { otp: string; expiresAt: number }> = (globalThis as any).otpStore;


const VerifyEmailOtpAndRegisterInputSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long.' }),
  role: z.enum(['admin', 'student'], { required_error: 'Role is required.'}),
  // Student specific fields (optional at schema level, logic handles based on role)
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.').optional(), // Required if role is student
  rollNo: z.string().max(50, 'Roll number is too long.').optional(),
  adminUniqueId: z.string().max(50, 'Admin ID is too long.').optional(), // Optional for students
}).refine(data => {
    if (data.role === 'student' && !data.name) {
        return false;
    }
    return true;
}, {
    message: 'Name is required for student registration.',
    path: ['name'],
});

export type VerifyEmailOtpAndRegisterInput = z.infer<typeof VerifyEmailOtpAndRegisterInputSchema>;

const VerifyEmailOtpAndRegisterOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userId: z.string().optional(),
  role: z.enum(['admin', 'student']).optional(),
  adminUniqueIdGenerated: z.string().optional(), // For newly registered admin
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
  async ({ email, otp, password, role, name, rollNo, adminUniqueId }) => {
    const storedEntry = otpStore[email];

    if (!storedEntry) {
      return { success: false, message: 'OTP not found. It might have expired or was never generated. Please request a new OTP.' };
    }

    if (Date.now() > storedEntry.expiresAt) {
      delete otpStore[email]; // Clean up expired OTP
      return { success: false, message: 'OTP has expired. Please request a new OTP.' };
    }

    if (storedEntry.otp !== otp) {
      return { success: false, message: 'Invalid OTP. Please try again.' };
    }

    // OTP is valid, proceed with Firebase user creation
    const firebaseAuthResult: User | AuthError = await firebaseSignUp({ email, password });

    if ('code' in firebaseAuthResult) { // AuthError
      const firebaseError = firebaseAuthResult as AuthError;
      let errorMessage = 'Registration failed. Please try again.';
      if (firebaseError.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
      } else if (firebaseError.message) {
        errorMessage = firebaseError.message;
      }
      return { success: false, message: errorMessage };
    } 
    
    // Firebase user created successfully
    const firebaseUser = firebaseAuthResult as User;
    delete otpStore[email]; // Clean up OTP

    try {
      if (role === 'admin') {
        const adminProfile = await createAdminProfile(firebaseUser.uid, email);
        return { 
          success: true, 
          message: 'Admin registration successful! Your Admin ID will be shown.', 
          userId: firebaseUser.uid, 
          role: 'admin',
          adminUniqueIdGenerated: adminProfile.adminUniqueId 
        };
      } else if (role === 'student') {
        if (!name) { // Should be caught by Zod refine, but good to double check
            return { success: false, message: "Student name is required." };
        }
        // Create base student profile
        await createUserProfileDocument(firebaseUser.uid, email, 'student', {
            displayName: name,
            rollNo: rollNo || undefined, // Pass undefined if empty string or null
        });

        let message = 'Student registration successful! Welcome to CertIntel!';
        
        if (adminUniqueId && adminUniqueId.trim() !== '') {
          const targetAdmin = await getAdminByUniqueId(adminUniqueId.trim());
          if (targetAdmin) {
            await createStudentLinkRequest(firebaseUser.uid, email, name, rollNo, targetAdmin.adminUniqueId, targetAdmin.userId);
            message += ` Your request to link with Teacher ID ${targetAdmin.adminUniqueId} has been submitted.`;
          } else {
            message += ` Could not find a Teacher with ID ${adminUniqueId}. You can request linkage later.`;
            // Update student profile to clear pending status if admin not found
            await createUserProfileDocument(firebaseUser.uid, email, 'student', { linkRequestStatus: 'none' });
          }
        }
        return { success: true, message, userId: firebaseUser.uid, role: 'student' };
      } else {
        // Should not happen due to Zod enum validation
        return { success: false, message: 'Invalid role specified.' };
      }
    } catch (profileError: any) {
      // This catch block is for errors during Firestore profile creation/linking
      console.error(`Error during profile/link creation for ${email} (role: ${role}):`, profileError);
      // Ideally, you might want to delete the Firebase Auth user here if Firestore operations fail,
      // to avoid orphaned auth accounts. This is complex and often handled by cleanup scripts or manual intervention.
      // For now, return an error message indicating partial success/failure.
      return { 
        success: false, 
        message: `Firebase user created, but failed to set up profile/link: ${profileError.message}. Please contact support.`,
        userId: firebaseUser.uid // Still return userId so they know auth account exists
      };
    }
  }
);
