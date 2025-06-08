
'use server';
/**
 * @fileOverview Flow to initiate sending an OTP to a user's email for verification.
 * - initiateEmailOtp: Generates an OTP, stores it with an expiry, and sends it via email.
 * - InitiateEmailOtpInput: Input type for the initiateEmailOtp function.
 * - InitiateEmailOtpOutput: Output type for the initiateEmailOtp function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import nodemailer from 'nodemailer';

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
    const GMAIL_EMAIL_ADDRESS = process.env.GMAIL_EMAIL_ADDRESS;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

    if (!GMAIL_EMAIL_ADDRESS || !GMAIL_APP_PASSWORD) {
      console.error('Gmail credentials (GMAIL_EMAIL_ADDRESS or GMAIL_APP_PASSWORD) are not set in .env.local. OTP will be logged to console instead of sent.');
      // Fallback to console logging if credentials are not set
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      otpStore[email] = { otp, expiresAt };
      console.log(`[OTP SIMULATION - Gmail credentials missing] OTP for ${email}: ${otp} (Expires at: ${new Date(expiresAt).toLocaleTimeString()})`);
      return { success: true, message: 'OTP generated and logged to console (Gmail credentials missing).' };
    }

    // Check if an OTP was recently sent for this email to prevent abuse
    const existingEntry = otpStore[email];
    if (existingEntry && (Date.now() < (existingEntry.expiresAt - 4 * 60 * 1000))) { // e.g., if OTP still has > 4 min left
        // Allow overriding for prototype simplicity. In prod, add rate limiting.
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = Date.now() + 5 * 60 * 1000; // OTP expires in 5 minutes

    otpStore[email] = { otp, expiresAt };

    // Configure Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_EMAIL_ADDRESS,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"CertIntel" <${GMAIL_EMAIL_ADDRESS}>`, // Sender address
      to: email, // List of receivers
      subject: 'Your CertIntel OTP Code', // Subject line
      text: `Your OTP code for CertIntel is: ${otp}. This code will expire in 5 minutes.`, // Plain text body
      html: `<p>Your OTP code for CertIntel is: <strong>${otp}</strong>.</p><p>This code will expire in 5 minutes.</p>`, // HTML body
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`OTP email sent to ${email}`);
      return { success: true, message: 'OTP has been sent to your email address. Please check your inbox (and spam folder).' };
    } catch (error: any) {
      console.error('Error sending OTP email:', error);
      // Log the OTP to console as a fallback if email sending fails
      console.log(`[OTP FALLBACK - Email send failed] OTP for ${email}: ${otp} (Expires at: ${new Date(expiresAt).toLocaleTimeString()})`);
      return { 
        success: false, 
        message: `Failed to send OTP email. Please check server logs. OTP (for testing): ${otp}` 
      };
    }
  }
);
