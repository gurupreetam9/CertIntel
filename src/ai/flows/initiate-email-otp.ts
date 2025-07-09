
'use server';
/**
 * @fileOverview Flow to initiate sending an OTP to a user's email for verification.
 * - initiateEmailOtp: Checks if email exists, generates an OTP, stores it, and sends via email.
 * - InitiateEmailOtpInput: Input type for the initiateEmailOtp function.
 * - InitiateEmailOtpOutput: Output type for the initiateEmailOtp function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from '@/lib/emailUtils'; // Import the centralized email utility
import { getAdminAuth } from '@/lib/firebase/adminConfig'; // Import Firebase Admin Auth
import { setOtp } from '@/lib/otpStore'; // Import centralized store helper

const InitiateEmailOtpInputSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});
export type InitiateEmailOtpInput = z.infer<typeof InitiateEmailOtpInputSchema>;

const InitiateEmailOtpOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type InitiateEmailOtpOutput = z.infer<typeof InitiateEmailOtpOutputSchema>;

// Exported wrapper function
export async function initiateEmailOtp(input: InitiateEmailOtpInput): Promise<InitiateEmailOtpOutput> {
  return initiateEmailOtpFlow(input);
}

const initiateEmailOtpFlow = ai.defineFlow(
  {
    name: 'initiateEmailOtpFlow',
    inputSchema: InitiateEmailOtpInputSchema,
    outputSchema: InitiateEmailOtpOutputSchema,
  },
  async ({ email }) => {
    let adminAuth;
    try {
      adminAuth = getAdminAuth(); // Get the admin auth instance
    } catch(initError: any) {
        console.error(`initiateEmailOtpFlow: CRITICAL - Failed to get Firebase Admin Auth instance. This usually means GOOGLE_APPLICATION_CREDENTIALS are not set correctly.`, initError);
        return { 
          success: false, 
          message: `Server configuration error: Firebase Admin services not available. Please check the server logs for details about GOOGLE_APPLICATION_CREDENTIALS.` 
        };
    }

    try {
      console.log(`initiateEmailOtpFlow: Checking if email ${email} already exists in Firebase Auth.`);
      await adminAuth.getUserByEmail(email);
      // If the above line does not throw, it means the user exists.
      console.log(`initiateEmailOtpFlow: Email ${email} is already registered.`);
      return { success: false, message: 'This email is already registered. Please login or use a different email.' };
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // This is the expected case for a new registration - email is available.
        console.log(`initiateEmailOtpFlow: Email ${email} is not registered. Proceeding with OTP generation.`);
      } else {
        // Some other unexpected error from Firebase Admin SDK during email check
        console.error(`initiateEmailOtpFlow: Error checking email existence for ${email}:`, error);
        return { success: false, message: 'An error occurred while checking email availability. Please try again.' };
      }
    }

    // Proceed with OTP generation and sending only if email is not found (i.e., available)
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    
    // Use the centralized store helper - now an async operation
    await setOtp(email, otp, 5); // 5 minute TTL

    console.log(`initiateEmailOtpFlow: Registration OTP for ${email} is ${otp}. Stored in Firestore.`);

    const emailSubject = 'Your CertIntel OTP Code';
    const emailText = `Your OTP code for CertIntel is: ${otp}. This code will expire in 5 minutes.`;
    const emailHtml = `<p>Your OTP code for CertIntel is: <strong>${otp}</strong>.</p><p>This code will expire in 5 minutes.</p>`;

    const emailResult = await sendEmail({
      to: email,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    });

    if (emailResult.success) {
      let successMessage = 'OTP has been sent to your email address. Please check your inbox (and spam folder).';
      if (emailResult.message.includes("simulated to console")) { // Check if it was simulated
        successMessage = 'OTP generated and logged to console (email sending simulated).';
      }
      return { success: true, message: successMessage };
    } else {
      // Log the OTP to console as a fallback if email sending fails for any reason
      console.log(`[OTP FALLBACK - Email send failed] OTP for ${email}: ${otp}`);
      return { 
        success: false, 
        message: `${emailResult.message} OTP (for testing if not sent): ${otp}`
      };
    }
  }
);
