
'use server';
/**
 * @fileOverview Flow to verify an email OTP and complete user registration for Admin or Student.
 * - verifyEmailOtpAndRegister: Verifies OTP, creates Firebase user, and Firestore profiles/requests.
 * - VerifyEmailOtpAndRegisterInput: Input type.
 * - VerifyEmailOtpAndRegisterOutput: Output type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { signUp as firebaseSignUp } from '@/lib/firebase/auth'; // Firebase client auth for user creation
import {
  createUserProfileDocument_SERVER, // Import SERVER version for profile creation
  createAdminProfile_SERVER,       // Import SERVER version for admin specific tasks
  // getAdminByUniqueId_SERVER,       // Import SERVER version if needed here
  // createStudentLinkRequest_SERVER, // Import SERVER version if needed here
} from '@/lib/services/userService.server'; // Import from the new .server.ts file
import type { User, AuthError } from 'firebase/auth';
// import type { UserProfile } from '@/lib/models/user'; // UserProfile type might still be useful
import { sendEmail } from '@/lib/emailUtils';

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
  adminUniqueId: z.string().max(50, 'Admin ID is too long.').optional(), // This is the associatedAdminUniqueId for students
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
  adminUniqueIdGenerated: z.string().optional(), // For new admins, their own shareable ID
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

    // Step 1: Create Firebase Auth user (uses client SDK functions, but called from server context)
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
    delete otpStore[email]; // Valid OTP used

    // Step 2: Create Firestore User Profile Document (uses SERVER versions of service functions)
    try {
      let registrationMessage = 'Registration successful!';
      let adminUniqueIdForResponse: string | undefined = undefined;
      let userDisplayName = name || email.split('@')[0];

      if (role === 'admin') {
        // createAdminProfile_SERVER internally calls createUserProfileDocument_SERVER
        const adminProfileDetails = await createAdminProfile_SERVER(firebaseUser.uid, email);
        adminUniqueIdForResponse = adminProfileDetails.adminUniqueId; // Their own generated ID
        registrationMessage = `Admin registration successful! Your Admin ID is: ${adminUniqueIdForResponse}`;

        await sendEmail({
          to: email,
          subject: 'Welcome to CertIntel, Admin!',
          text: `Hello Admin,\n\nYour registration with CertIntel is complete. Your unique Admin ID is: ${adminUniqueIdForResponse}. You can share this ID with your students.\n\nRegards,\nThe CertIntel Team`,
          html: `<p>Hello Admin,</p><p>Your registration with CertIntel is complete. Your unique Admin ID is: <strong>${adminUniqueIdForResponse}</strong>. You can share this ID with your students.</p><p>Regards,<br/>The CertIntel Team</p>`,
        });

      } else if (role === 'student') {
        if (!name) {
            return { success: false, message: "Student name is required." }; // Should be caught by Zod, but defensive
        }
        userDisplayName = name;
        const studentProfileCreationData = {
            displayName: name,
            rollNo: (rollNo && rollNo.trim() !== '') ? rollNo.trim() : undefined,
            // Pass the adminUniqueId from the form if the student wants to link during registration
            associatedAdminUniqueId: (adminUniqueId && adminUniqueId.trim() !== '') ? adminUniqueId.trim() : undefined,
        };

        // createUserProfileDocument_SERVER will now handle finding adminFirebaseId and creating the link request if associatedAdminUniqueId is provided.
        await createUserProfileDocument_SERVER(firebaseUser.uid, email, 'student', studentProfileCreationData);

        let studentWelcomeMessage = `Hello ${userDisplayName},\n\nWelcome to CertIntel! Your registration is complete.`;
        let studentWelcomeHtml = `<p>Hello ${userDisplayName},</p><p>Welcome to CertIntel! Your registration is complete.</p>`;

        if (studentProfileCreationData.associatedAdminUniqueId) {
          studentWelcomeMessage += ` Your request to link with Teacher/Admin ID ${studentProfileCreationData.associatedAdminUniqueId} has been initiated and is pending approval.`;
          studentWelcomeHtml += `<p>Your request to link with Teacher/Admin ID <strong>${studentProfileCreationData.associatedAdminUniqueId}</strong> has been initiated and is pending approval.</p>`;
          registrationMessage = `Student registration successful! Your request to link with Teacher ID ${studentProfileCreationData.associatedAdminUniqueId} is pending.`;
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
        // Should not happen due to Zod enum
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
      console.error(`Error during server-side profile creation or email sending for ${email} (role: ${role}):`, profileError);
      // It's good practice to not leak detailed internal error structures to the client unless necessary.
      // The original error message was good here.
      let detailedMessage = `Firebase user created, but failed to set up profile/link or send confirmation email. Error: ${profileError.message || 'Unknown Firestore/Email error'}`;
      if (profileError.code) {
        detailedMessage += ` (Code: ${profileError.code})`;
      }
      if (profileError.details) {
        detailedMessage += ` Details: ${profileError.details}`;
      }
      console.error("Full profileError object from server-side operations:", profileError);
      return {
        success: false,
        message: detailedMessage + ". Please contact support.",
        userId: firebaseUser.uid // Still return UID as Firebase user was created
      };
    }
  }
);
