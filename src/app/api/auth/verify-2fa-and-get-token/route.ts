
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/adminConfig';
import { getOtp, deleteOtp } from '@/lib/otpStore';
import { z } from 'zod';

export const runtime = 'nodejs';

const verifyRequestSchema = z.object({
  uid: z.string().min(1, 'User ID is required.'),
  otp: z.string().length(6, 'OTP must be 6 digits.'),
});

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/auth/verify-2fa-and-get-token (Req ID: ${reqId}): POST request received.`);

  try {
    const body = await request.json();
    const validation = verifyRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, message: 'Invalid request body.', errors: validation.error.format() }, { status: 400 });
    }

    const { uid, otp } = validation.data;
    const adminAuth = getAdminAuth();

    // Get the user's email from their UID to check the OTP
    const userRecord = await adminAuth.getUser(uid);
    if (!userRecord.email) {
      console.error(`API (Req ID: ${reqId}): User with UID ${uid} does not have an email address.`);
      return NextResponse.json({ success: false, message: 'User account is missing an email address.' }, { status: 400 });
    }
    const email = userRecord.email;

    const storedEntry = await getOtp(email);
    if (!storedEntry) {
      return NextResponse.json({ success: false, message: 'OTP not found. It may have expired. Please log in again.' }, { status: 401 });
    }

    if (Date.now() > storedEntry.expiresAt.toDate().getTime()) {
      await deleteOtp(email);
      return NextResponse.json({ success: false, message: 'OTP has expired. Please log in again.' }, { status: 401 });
    }

    if (storedEntry.otp !== otp) {
      // In a real app, you might add rate limiting or account locking here.
      return NextResponse.json({ success: false, message: 'Invalid verification code.' }, { status: 401 });
    }

    // Success: Invalidate the OTP and create a custom sign-in token
    await deleteOtp(email);
    const customToken = await adminAuth.createCustomToken(uid);
    
    console.log(`API (Req ID: ${reqId}): OTP verified for UID ${uid}. Custom token created.`);
    return NextResponse.json({ success: true, token: customToken }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/auth/verify-2fa-and-get-token (Req ID: ${reqId}): CRITICAL ERROR.`, { message: error.message, code: error.code });
    return NextResponse.json({ success: false, message: error.message || 'An internal server error occurred.' }, { status: 500 });
  }
}
