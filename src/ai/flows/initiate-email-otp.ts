
'use server';
/**
 * @fileOverview Flow to initiate sending an OTP to a user's email for verification.
 * - initiateEmailOtp: Generates an OTP, stores it with an expiry, and simulates sending it.
 * - InitiateEmailOtpInput: Input type for the initiateEmailOtp function.
 * - InitiateEmailOtpOutput: Output type for the initiateEmailOtp function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod'; // Using global Zod as per project setup

// HACK: In-memory store for OTPs. NOT SUITABLE FOR PRODUCTION.
// In a real app, use a database (e.g., Firestore, Redis) for OTP storage.
// This object will be shared across flow invocations IN THE SAME Genkit dev server process.
// It will NOT be shared reliably in a scaled/serverless deployment environment.
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
    // Check if an OTP was recently sent for this email to prevent abuse (simple check)
    const existingEntry = otpStore[email];
    if (existingEntry && (Date.now() < (existingEntry.expiresAt - 4 * 60 * 1000))) { // e.g., if OTP still has > 4 min left
        // console.log(`[OTP SIMULATION] Resending OTP for ${email}: ${existingEntry.otp}`);
        // return { success: true, message: 'An OTP was recently sent. Please check your console or try again in a minute.'};
        // For simplicity in prototype, allow overriding. In prod, add rate limiting.
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = Date.now() + 5 * 60 * 1000; // OTP expires in 5 minutes

    otpStore[email] = { otp, expiresAt };

    // Simulate sending email
    console.log(`[OTP SIMULATION] OTP for ${email}: ${otp} (Expires at: ${new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`);
    
    // In a real app, you would integrate an email sending service here.
    // For example: await sendEmailService.send({ to: email, subject: "Your OTP Code", body: `Your OTP is ${otp}` });

    return { success: true, message: 'OTP has been generated. Please check your server console for the OTP code.' };
  }
);

