
'use server';
/**
 * @fileOverview Flow to verify an email OTP for registration purposes.
 * - verifyRegistrationOtp: Verifies OTP against the one stored in the database.
 * - VerifyRegistrationOtpInput: Input type.
 * - VerifyRegistrationOtpOutput: Output type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getOtp, deleteOtp } from '@/lib/otpStore';

const VerifyRegistrationOtpInputSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
});
export type VerifyRegistrationOtpInput = z.infer<typeof VerifyRegistrationOtpInputSchema>;

const VerifyRegistrationOtpOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type VerifyRegistrationOtpOutput = z.infer<typeof VerifyRegistrationOtpOutputSchema>;

// Exported wrapper function
export async function verifyRegistrationOtp(input: VerifyRegistrationOtpInput): Promise<VerifyRegistrationOtpOutput> {
  return verifyRegistrationOtpFlow(input);
}

const verifyRegistrationOtpFlow = ai.defineFlow(
  {
    name: 'verifyRegistrationOtpFlow',
    inputSchema: VerifyRegistrationOtpInputSchema,
    outputSchema: VerifyRegistrationOtpOutputSchema,
  },
  async ({ email, otp }) => {
    const storedEntry = await getOtp(email);

    if (!storedEntry) {
      return { success: false, message: 'OTP not found. It might have expired or was never generated. Please request a new OTP.' };
    }

    if (Date.now() > storedEntry.expiresAt.toDate().getTime()) {
      await deleteOtp(email);
      return { success: false, message: 'OTP has expired. Please request a new OTP.' };
    }

    if (storedEntry.otp !== otp) {
      return { success: false, message: 'Invalid OTP. Please try again.' };
    }

    // OTP is valid. We delete it so it can't be used again.
    await deleteOtp(email); 

    return { success: true, message: 'OTP verified successfully.' };
  }
);
