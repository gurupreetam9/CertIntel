
import { NextResponse, type NextRequest } from 'next/server';
import { getOtp, deleteOtp } from '@/lib/otpStore';
import { z } from 'zod';

export const runtime = 'nodejs';

const verifyRequestSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = verifyRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, message: 'Invalid request body.', errors: validation.error.format() }, { status: 400 });
    }

    const { email, otp } = validation.data;
    const storedEntry = await getOtp(email);

    if (!storedEntry) {
      return NextResponse.json({ success: false, message: 'OTP not found. It may have expired. Please log in again.' }, { status: 400 });
    }
    
    // The expiresAt field from Firestore is a Timestamp object. We need to convert it.
    if (Date.now() > storedEntry.expiresAt.toDate().getTime()) {
      await deleteOtp(email);
      return NextResponse.json({ success: false, message: 'OTP has expired. Please log in again.' }, { status: 400 });
    }

    if (storedEntry.otp !== otp) {
      // In a real app, you might add rate limiting or account locking here after several failed attempts.
      return NextResponse.json({ success: false, message: 'Invalid verification code.' }, { status: 400 });
    }
    
    // Success, invalidate the OTP
    await deleteOtp(email);

    return NextResponse.json({ success: true, message: 'Verification successful.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/auth/verify-login-otp: CRITICAL ERROR.`, { message: error.message });
    return NextResponse.json({ success: false, message: 'An internal server error occurred.' }, { status: 500 });
  }
}
