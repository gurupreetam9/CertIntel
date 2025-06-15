
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
import type { UserRole, UserProfile } from '@/lib/models/user';

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
        // For admin, createAdminProfile internally calls createUserProfileDocument with role 'admin'
        const adminProfileDetails = await createAdminProfile(firebaseUser.uid, email);
        return { 
          success: true, 
          message: 'Admin registration successful! Your Admin ID will be shown.', 
          userId: firebaseUser.uid, 
          role: 'admin',
          adminUniqueIdGenerated: adminProfileDetails.adminUniqueId 
        };
      } else if (role === 'student') {
        if (!name) { // Should be caught by Zod refine, but good to double check
            return { success: false, message: "Student name is required." };
        }
        
        // Prepare data for the student profile document creation
        // Only include fields directly managed at initial creation.
        // Linking fields (associatedAdminUniqueId, linkRequestStatus) will be handled by createStudentLinkRequest if needed.
        const studentProfileCreationData: Partial<UserProfile> = {
            displayName: name,
            rollNo: (rollNo && rollNo.trim() !== '') ? rollNo.trim() : undefined, // Pass as undefined if empty to let service default to null
        };
        
        // Create base student profile in 'users' collection
        // createUserProfileDocument will set linkRequestStatus to 'none' and associatedAdmin fields to null by default.
        await createUserProfileDocument(firebaseUser.uid, email, 'student', studentProfileCreationData);

        let message = 'Student registration successful! Welcome to CertIntel!';
        
        // If an admin ID was provided by the student, attempt to create the link request
        // This will also update the student's profile with 'pending' status and admin IDs.
        const targetAdminUniqueId = (adminUniqueId && adminUniqueId.trim() !== '') ? adminUniqueId.trim() : null;
        if (targetAdminUniqueId) {
          const targetAdmin = await getAdminByUniqueId(targetAdminUniqueId);
          if (targetAdmin) {
            await createStudentLinkRequest(
              firebaseUser.uid, 
              email, 
              name, 
              studentProfileCreationData.rollNo || null, // Pass the actual rollNo or null
              targetAdmin.adminUniqueId, 
              targetAdmin.userId
            );
            message += ` Your request to link with Teacher ID ${targetAdmin.adminUniqueId} has been submitted.`;
          } else {
            message += ` Could not find a Teacher with ID ${targetAdminUniqueId}. You can request linkage later from your profile settings.`;
            // No need to update student profile here, as createUserProfileDocument already set linkRequestStatus to 'none'
            // and associatedAdmin fields to null.
          }
        }
        return { success: true, message, userId: firebaseUser.uid, role: 'student' };
      } else {
        // Should not happen due to Zod enum validation
        return { success: false, message: 'Invalid role specified.' };
      }
    } catch (profileError: any) {
      console.error(`Error during profile/link creation for ${email} (role: ${role}):`, profileError);
      // Construct a more detailed error message if possible
      let detailedMessage = `Firebase user created, but failed to set up profile/link. Error: ${profileError.message || 'Unknown Firestore error'}`;
      if (profileError.code) { // Firestore errors often have a code
        detailedMessage += ` (Code: ${profileError.code})`;
      }
       if (profileError.details) {
        detailedMessage += ` Details: ${profileError.details}`;
      }
      console.error("Full profileError object:", profileError);
      return { 
        success: false, 
        message: detailedMessage + ". Please contact support.",
        userId: firebaseUser.uid 
      };
    }
  }
);

