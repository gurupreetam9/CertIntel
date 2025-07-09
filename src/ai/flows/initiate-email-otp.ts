
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
import { getAdminFirestore } from '@/lib/firebase/adminConfig'; // Import Firebase Admin Firestore
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
    let adminFirestore;
    try {
      adminFirestore = getAdminFirestore(); // Get the admin firestore instance
    } catch(initError: any) {
        console.error(`initiateEmailOtpFlow: CRITICAL - Failed to get Firebase Admin Firestore instance. This usually means GOOGLE_APPLICATION_CREDENTIALS are not set correctly.`, initError);
        return { 
          success: false, 
          message: `Server configuration error: Firebase Admin services not available. Please check the server logs for details about GOOGLE_APPLICATION_CREDENTIALS.` 
        };
    }

    try {
      console.log(`initiateEmailOtpFlow: Checking if email ${email} already exists in Firestore 'users' collection.`);
      const usersRef = adminFirestore.collection('users');
      const q = usersRef.where('email', '==', email).limit(1);
      const querySnapshot = await q.get();

      if (!querySnapshot.empty) {
        // If the query is not empty, it means the user exists.
        console.log(`initiateEmailOtpFlow: Email ${email} is already registered (found in Firestore).`);
        return { success: false, message: 'This email is already registered. Please login or use a different email.' };
      }

      // If we are here, the email is not in our Firestore 'users' collection, so it's available.
      console.log(`initiateEmailOtpFlow: Email ${email} is not registered. Proceeding with OTP generation.`);

    } catch (error: any) {
      // This would catch errors with the Firestore query itself.
      console.error(`initiateEmailOtpFlow: Error checking email existence for ${email} in Firestore:`, error);
      return { success: false, message: 'An error occurred while checking email availability. Please try again.' };
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
