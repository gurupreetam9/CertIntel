
'use server';
/**
 * @fileOverview Flow to initiate sending an OTP to a user's email for verification.
 * - initiateEmailOtp: Generates an OTP, stores it with an expiry, and sends it via email.
 * - InitiateEmailOtpInput: Input type for the initiateEmailOtp function.
 * - InitiateEmailOtpOutput: Output type for the initiateEmailOtp function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from '@/lib/emailUtils'; // Import the centralized email utility

// HACK: In-memory store for OTPs. NOT SUITABLE FOR PRODUCTION.
// In a real app, use a database (e.g., Firestore, Redis) for OTP storage.
if (!(globalThis as any).otpStore) {
  (globalThis as any).otpStore = {};
}
const otpStore: Record<string, { otp: string; expiresAt: number }> = (globalThis as any).otpStore;

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
    // Check if an OTP was recently sent for this email to prevent abuse
    // const existingEntry = otpStore[email];
    // if (existingEntry && (Date.now() < (existingEntry.expiresAt - 4 * 60 * 1000))) { 
    //   // Allow overriding for prototype simplicity. In prod, add rate limiting.
    // }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = Date.now() + 5 * 60 * 1000; // OTP expires in 5 minutes

    otpStore[email] = { otp, expiresAt };
    console.log(`initiateEmailOtpFlow: OTP for ${email} is ${otp}. Stored in memory.`);

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
      console.log(`[OTP FALLBACK - Email send failed] OTP for ${email}: ${otp} (Expires at: ${new Date(expiresAt).toLocaleTimeString()})`);
      return { 
        success: false, 
        message: `${emailResult.message} OTP (for testing if not sent): ${otp}`
      };
    }
  }
);
