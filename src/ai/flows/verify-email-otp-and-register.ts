
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
} from '@/lib/services/userService';
import type { User, AuthError } from 'firebase/auth';
import type { UserProfile } from '@/lib/models/user';
import { sendEmail } from '@/lib/emailUtils'; // Import the centralized email utility

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
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.').optional(), 
  rollNo: z.string().max(50, 'Roll number is too long.').optional(),
  adminUniqueId: z.string().max(50, 'Admin ID is too long.').optional(), 
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
  adminUniqueIdGenerated: z.string().optional(), 
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
      delete otpStore[email]; 
      return { success: false, message: 'OTP has expired. Please request a new OTP.' };
    }

    if (storedEntry.otp !== otp) {
      return { success: false, message: 'Invalid OTP. Please try again.' };
    }

    const firebaseAuthResult: User | AuthError = await firebaseSignUp({ email, password });

    if ('code' in firebaseAuthResult) { 
      const firebaseError = firebaseAuthResult as AuthError;
      let errorMessage = 'Registration failed. Please try again.';
      if (firebaseError.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
      } else if (firebaseError.message) {
        errorMessage = firebaseError.message;
      }
      return { success: false, message: errorMessage };
    } 
    
    const firebaseUser = firebaseAuthResult as User;
    delete otpStore[email]; 

    try {
      let registrationMessage = 'Registration successful!';
      let adminUniqueIdForResponse: string | undefined = undefined;
      let userDisplayName = name || email.split('@')[0];

      if (role === 'admin') {
        const adminProfileDetails = await createAdminProfile(firebaseUser.uid, email);
        adminUniqueIdForResponse = adminProfileDetails.adminUniqueId;
        registrationMessage = `Admin registration successful! Your Admin ID is: ${adminUniqueIdForResponse}`;
        
        await sendEmail({
          to: email,
          subject: 'Welcome to CertIntel, Admin!',
          text: `Hello Admin,\n\nYour registration with CertIntel is complete. Your unique Admin ID is: ${adminUniqueIdForResponse}. You can share this ID with your students.\n\nRegards,\nThe CertIntel Team`,
          html: `<p>Hello Admin,</p><p>Your registration with CertIntel is complete. Your unique Admin ID is: <strong>${adminUniqueIdForResponse}</strong>. You can share this ID with your students.</p><p>Regards,<br/>The CertIntel Team</p>`,
        });

      } else if (role === 'student') {
        if (!name) { 
            return { success: false, message: "Student name is required." };
        }
        
        const studentProfileCreationData: Partial<UserProfile> = {
            displayName: name,
            rollNo: (rollNo && rollNo.trim() !== '') ? rollNo.trim() : undefined, 
            associatedAdminUniqueId: (adminUniqueId && adminUniqueId.trim() !== '') ? adminUniqueId.trim() : undefined,
        };
        
        // The createUserProfileDocument will handle setting linkRequestStatus to 'pending' if an adminUniqueId is provided.
        // This part of the logic (creating the actual studentLinkRequest doc) is handled by studentRequestLinkWithAdmin which is typically called from profile settings.
        // For now, we just store the intent.
        await createUserProfileDocument(firebaseUser.uid, email, 'student', studentProfileCreationData);
        userDisplayName = name;

        let studentWelcomeMessage = `Hello ${userDisplayName},\n\nWelcome to CertIntel! Your registration is complete.`;
        let studentWelcomeHtml = `<p>Hello ${userDisplayName},</p><p>Welcome to CertIntel! Your registration is complete.</p>`;

        if (studentProfileCreationData.associatedAdminUniqueId) {
          studentWelcomeMessage += ` You attempted to link with Teacher/Admin ID ${studentProfileCreationData.associatedAdminUniqueId}. This request will be processed separately, or you can finalize it from your profile settings.`;
          studentWelcomeHtml += `<p>You attempted to link with Teacher/Admin ID <strong>${studentProfileCreationData.associatedAdminUniqueId}</strong>. This request will be processed separately, or you can finalize it from your profile settings if the admin needs to approve it.</p>`;
          registrationMessage = `Student registration successful! Your request to link with Teacher ID ${studentProfileCreationData.associatedAdminUniqueId} has been noted. You might need to finalize this from your profile settings.`;
        } else {
           registrationMessage = 'Student registration successful! Welcome to CertIntel!';
        }
        studentWelcomeMessage += `\n\nRegards,\nThe CertIntel Team`;
        studentWelcomeHtml += `<p>Regards,<br/>The CertIntel Team</p>`;

        await sendEmail({
          to: email,
          subject: `Welcome to CertIntel, ${userDisplayName}!`,
          text: studentWelcomeMessage,
          html: studentWelcomeHtml,
        });
      } else {
        return { success: false, message: 'Invalid role specified.' };
      }

      return { 
        success: true, 
        message: registrationMessage, 
        userId: firebaseUser.uid, 
        role: role,
        adminUniqueIdGenerated: adminUniqueIdForResponse 
      };

    } catch (profileError: any) {
      console.error(`Error during profile creation or email sending for ${email} (role: ${role}):`, profileError);
      let detailedMessage = `Firebase user created, but failed to set up profile/link or send confirmation email. Error: ${profileError.message || 'Unknown Firestore/Email error'}`;
      if (profileError.code) { 
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
