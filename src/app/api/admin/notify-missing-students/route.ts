
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminConfig';
import { sendEmail } from '@/lib/emailUtils';
import { z } from 'zod';

const USERS_COLLECTION = 'users';

const notifyRequestSchema = z.object({
  students: z.array(z.object({
    email: z.string().email(),
    name: z.string(),
  })).min(1),
  courseName: z.string().min(1),
  adminName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/admin/notify-missing-students (Req ID: ${reqId}): POST request received.`);

  try {
    const adminAuth = getAdminAuth();
    const adminFirestore = getAdminFirestore();

    // 1. Authenticate the request
    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const adminUid = decodedToken.uid;
    console.log(`API (Req ID: ${reqId}): Token verified for admin UID: ${adminUid}.`);

    // 2. Authorize: Check if requester is an admin
    const adminProfileSnap = await adminFirestore.collection(USERS_COLLECTION).doc(adminUid).get();
    if (!adminProfileSnap.exists || adminProfileSnap.data()?.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden: You are not authorized to perform this action.' }, { status: 403 });
    }
    const adminProfileData = adminProfileSnap.data();

    // 3. Validate request body
    const body = await request.json();
    const validation = notifyRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body.', errors: validation.error.format() }, { status: 400 });
    }
    const { students, courseName } = validation.data;
    const adminName = validation.data.adminName || adminProfileData?.displayName || 'your admin';

    // 4. Send emails
    const emailPromises = students.map(student => {
      const studentName = student.name || 'Student';
      const subject = `Action Required: Complete Your Course - "${courseName}"`;
      const text = `Hello ${studentName},\n\nThis is a friendly reminder from your administrator, ${adminName}, regarding the course "${courseName}".\n\nPlease complete this course and upload your certificate to CertIntel at your earliest convenience.\n\nThank you,\nThe CertIntel Team`;
      const html = `<p>Hello ${studentName},</p><p>This is a friendly reminder from your administrator, <strong>${adminName}</strong>, regarding the course "<strong>${courseName}</strong>".</p><p>Please complete this course and upload your certificate to CertIntel at your earliest convenience.</p><p>Thank you,<br/>The CertIntel Team</p>`;
      
      return sendEmail({
        to: student.email,
        subject,
        text,
        html,
      });
    });

    const results = await Promise.allSettled(emailPromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failureCount = results.length - successCount;
    
    let message = `Successfully sent notifications to ${successCount} student(s).`;
    if (failureCount > 0) {
      message += ` Failed to send to ${failureCount} student(s). Check server logs for details.`;
    }
    console.log(`API (Req ID: ${reqId}): Email sending complete. Success: ${successCount}, Failures: ${failureCount}.`);

    return NextResponse.json({ success: true, message }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/admin/notify-missing-students (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    return NextResponse.json({ message: `An internal server error occurred: ${error.message}` }, { status: 500 });
  }
}
