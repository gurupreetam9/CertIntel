
'use server';
/**
 * @fileOverview Flow to send a 2FA OTP to a user's email upon login.
 * - initiateLoginOtp: Generates an OTP, stores it, and sends via email for an existing user.
 * - InitiateLoginOtpInput: Input type.
 * - InitiateLoginOtpOutput: Output type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from '@/lib/emailUtils';
import { setOtp } from '@/lib/otpStore';

const InitiateLoginOtpInputSchema = z.object({
  email: z.string().email(),
});
export type InitiateLoginOtpInput = z.infer<typeof InitiateLoginOtpInputSchema>;

const InitiateLoginOtpOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type InitiateLoginOtpOutput = z.infer<typeof InitiateLoginOtpOutputSchema>;

// Exported wrapper function
export async function initiateLoginOtp(input: InitiateLoginOtpInput): Promise<InitiateLoginOtpOutput> {
  return initiateLoginOtpFlow(input);
}

const initiateLoginOtpFlow = ai.defineFlow(
  {
    name: 'initiateLoginOtpFlow',
    inputSchema: InitiateLoginOtpInputSchema,
    outputSchema: InitiateLoginOtpOutputSchema,
  },
  async ({ email }) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    
    // Use the centralized OTP store - now an async operation
    await setOtp(email, otp, 5); // 5 minute TTL

    console.log(`initiateLoginOtpFlow: 2FA Login OTP for ${email} is ${otp}. Stored in Firestore.`);

    const emailSubject = 'Your CertIntel Login Verification Code';
    const emailText = `Your login verification code for CertIntel is: ${otp}. This code will expire in 5 minutes.`;
    const emailHtml = `<p>Your login verification code for CertIntel is: <strong>${otp}</strong>.</p><p>This code will expire in 5 minutes.</p>`;

    const emailResult = await sendEmail({
      to: email,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    });

    if (emailResult.success) {
      let successMessage = 'A verification code has been sent to your email address.';
      if (emailResult.message.includes("simulated to console")) {
        successMessage = 'Verification code generated and logged to console (email sending simulated).';
      }
      return { success: true, message: successMessage };
    } else {
      console.log(`[2FA OTP FALLBACK - Email send failed] Login OTP for ${email}: ${otp}`);
      return { 
        success: false, 
        message: `${emailResult.message} OTP (for testing if not sent): ${otp}`
      };
    }
  }
);
