
'use server';
/**
 * @fileOverview Flow to initiate the account deletion process by sending a secure link.
 * - initiateAccountDeletion: Generates a token, stores it, and emails a deletion link.
 * - InitiateAccountDeletionInput: Input type.
 * - InitiateAccountDeletionOutput: Output type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from '@/lib/emailUtils';
import { v4 as uuidv4 } from 'uuid';

// HACK: In-memory store for deletion tokens. NOT SUITABLE FOR PRODUCTION.
// In a real app, use a database (e.g., Firestore, Redis) with TTL support.
if (!(globalThis as any).deletionTokenStore) {
  (globalThis as any).deletionTokenStore = {};
}
const deletionTokenStore: Record<string, { userId: string; email: string; expiresAt: number }> = (globalThis as any).deletionTokenStore;

const InitiateAccountDeletionInputSchema = z.object({
  email: z.string().email(),
  userId: z.string(),
});
export type InitiateAccountDeletionInput = z.infer<typeof InitiateAccountDeletionInputSchema>;

const InitiateAccountDeletionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type InitiateAccountDeletionOutput = z.infer<typeof InitiateAccountDeletionOutputSchema>;

export async function initiateAccountDeletion(input: InitiateAccountDeletionInput): Promise<InitiateAccountDeletionOutput> {
  return initiateAccountDeletionFlow(input);
}

const initiateAccountDeletionFlow = ai.defineFlow(
  {
    name: 'initiateAccountDeletionFlow',
    inputSchema: InitiateAccountDeletionInputSchema,
    outputSchema: InitiateAccountDeletionOutputSchema,
  },
  async ({ email, userId }) => {
    const token = uuidv4();
    const expiresAt = Date.now() + 15 * 60 * 1000; // Token expires in 15 minutes

    deletionTokenStore[token] = { userId, email, expiresAt };
    console.log(`initiateAccountDeletionFlow: Deletion token for ${email} (UID: ${userId}) is ${token}. Stored in memory.`);

    let finalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    // Fallback for Firebase App Hosting, which is a likely deployment environment.
    if (!finalBaseUrl && process.env.FIREBASE_APP_HOSTING_URL) {
      finalBaseUrl = `https://${process.env.FIREBASE_APP_HOSTING_URL}`;
      console.log(`initiateAccountDeletionFlow: Constructed base URL from FIREBASE_APP_HOSTING_URL: ${finalBaseUrl}`);
    }

    // If no base URL could be determined, log a critical error and use localhost as a last resort.
    if (!finalBaseUrl) {
      const defaultUrl = 'http://localhost:9005';
      const errorMessage = `CRITICAL: Could not determine base URL for account deletion link. Neither NEXT_PUBLIC_BASE_URL nor FIREBASE_APP_HOSTING_URL environment variables are set. Defaulting to '${defaultUrl}'. This link will NOT work in a deployed production environment.`;
      console.error(errorMessage);
      finalBaseUrl = defaultUrl;
    }

    const deletionUrl = `${finalBaseUrl}/delete-account?token=${token}`;

    const emailSubject = 'Account Deletion Confirmation for CertIntel';
    const emailText = `We have received a request to delete your CertIntel account. To confirm this action, please click the link below. This link is valid for 15 minutes.\n\n${deletionUrl}\n\nIf you did not request this, you can safely ignore this email.`;
    const emailHtml = `<p>We have received a request to delete your CertIntel account. To confirm this action, please click the link below. This link is valid for 15 minutes.</p><p><a href="${deletionUrl}"><strong>Confirm Account Deletion</strong></a></p><p>If you did not request this, you can safely ignore this email.</p>`;

    const emailResult = await sendEmail({
      to: email,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    });

    if (emailResult.success) {
      let successMessage = 'A confirmation link has been sent to your email. Please check your inbox.';
       if (emailResult.message.includes("simulated to console")) {
        successMessage = `Deletion link generated and logged to console (email sending simulated). URL: ${deletionUrl}`;
      }
      return { success: true, message: successMessage };
    } else {
      console.log(`[DELETION FALLBACK - Email send failed] Deletion URL for ${email}: ${deletionUrl}`);
      return { 
        success: false, 
        message: `${emailResult.message}. Deletion URL (for testing if not sent): ${deletionUrl}`
      };
    }
  }
);
