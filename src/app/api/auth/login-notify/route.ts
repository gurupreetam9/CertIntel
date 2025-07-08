
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/adminConfig';
import { sendEmail } from '@/lib/emailUtils';

export const runtime = 'nodejs'; // Required for accessing request IP

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/auth/login-notify (Req ID: ${reqId}): POST request received.`);

  try {
    const adminAuth = getAdminAuth();

    // 1. Authenticate the request
    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    const { email, name } = decodedToken;
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'Unknown IP';
    const location = 'Location information requires a third-party Geo-IP service.'; // Placeholder

    if (!email) {
      return NextResponse.json({ message: 'User email not found in token.' }, { status: 400 });
    }

    const subject = 'Security Alert: New Sign-in to Your CertIntel Account';
    const text = `Hello ${name || email},\n\nWe detected a new sign-in to your CertIntel account.\n\nDetails:\n- IP Address: ${ip}\n- Approximate Location: ${location}\n- Time: ${new Date().toUTCString()}\n\nIf this was not you, please secure your account immediately by resetting your password. If this was you, you can safely ignore this email.\n\nThanks,\nThe CertIntel Team`;
    const html = `<p>Hello ${name || email},</p><p>We detected a new sign-in to your CertIntel account.</p><p><strong>Details:</strong></p><ul><li><strong>IP Address:</strong> ${ip}</li><li><strong>Approximate Location:</strong> ${location}</li><li><strong>Time:</strong> ${new Date().toUTCString()}</li></ul><p>If this was not you, please secure your account immediately by resetting your password. If this was you, you can safely ignore this email.</p><p>Thanks,<br/>The CertIntel Team</p>`;
    
    await sendEmail({
      to: email,
      subject,
      text,
      html,
    });

    console.log(`API (Req ID: ${reqId}): Login notification sent to ${email}.`);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/auth/login-notify (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
    });
    // Don't send error details back to the client for a notification endpoint
    return NextResponse.json({ message: 'Failed to send notification.' }, { status: 500 });
  }
}
