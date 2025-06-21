
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminConfig';
import { FieldValue } from 'firebase-admin/firestore';
import type { UserProfile } from '@/lib/models/user';
import { sendEmail } from '@/lib/emailUtils';

const USERS_COLLECTION = 'users';
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/admin/remove-student-link (Req ID: ${reqId}): POST request received.`);

  try {
    const adminAuth = getAdminAuth();
    const adminFirestore = getAdminFirestore();

    // 1. Authenticate the request
    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      console.warn(`API (Req ID: ${reqId}): AUTH FAIL - Missing or invalid Authorization header.`);
      return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;
    console.log(`API (Req ID: ${reqId}): Requester UID (from token): ${requesterUid}`);

    // 2. Parse request body
    const { studentToRemoveId } = await request.json();
    if (!studentToRemoveId) {
      console.warn(`API (Req ID: ${reqId}): FAIL - studentToRemoveId is required in the request body.`);
      return NextResponse.json({ message: 'studentToRemoveId is required.' }, { status: 400 });
    }
    console.log(`API (Req ID: ${reqId}): Attempting to remove student ${studentToRemoveId} by admin ${requesterUid}`);

    // 3. Authorize the requester as an admin
    const adminProfileSnap = await adminFirestore.collection(USERS_COLLECTION).doc(requesterUid).get();
    if (!adminProfileSnap.exists() || adminProfileSnap.data()?.role !== 'admin') {
      console.warn(`API (Req ID: ${reqId}): AUTH FAIL - Requester ${requesterUid} is not an admin.`);
      return NextResponse.json({ message: 'Forbidden: You are not authorized to perform this action.' }, { status: 403 });
    }
    const adminProfileData = adminProfileSnap.data() as UserProfile;
    console.log(`API (Req ID: ${reqId}): Requester ${requesterUid} VERIFIED as admin.`);

    // 4. Get the student's profile to verify the link and get their email
    const studentDocRef = adminFirestore.collection(USERS_COLLECTION).doc(studentToRemoveId);
    const studentProfileSnap = await studentDocRef.get();
    if (!studentProfileSnap.exists()) {
      console.warn(`API (Req ID: ${reqId}): Student profile for ID ${studentToRemoveId} not found.`);
      return NextResponse.json({ message: 'Student profile not found.' }, { status: 404 });
    }
    const studentProfileData = studentProfileSnap.data() as UserProfile;

    // Verify student is actually linked to this admin
    if (studentProfileData.associatedAdminFirebaseId !== requesterUid) {
      console.warn(`API (Req ID: ${reqId}): Student ${studentToRemoveId} is not linked to admin ${requesterUid}.`);
      return NextResponse.json({ message: 'Forbidden: This student is not linked to you.' }, { status: 403 });
    }

    // 5. Perform the batched write with Admin SDK privileges
    const batch = adminFirestore.batch();

    // Update the student's profile
    batch.update(studentDocRef, {
      associatedAdminFirebaseId: null,
      associatedAdminUniqueId: null,
      linkRequestStatus: 'none',
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update the corresponding link request document(s)
    const requestsQuery = adminFirestore.collection(STUDENT_LINK_REQUESTS_COLLECTION)
      .where('studentUserId', '==', studentToRemoveId)
      .where('adminFirebaseId', '==', requesterUid)
      .where('status', '==', 'accepted');
    const requestsSnapshot = await requestsQuery.get();
    if (!requestsSnapshot.empty) {
      requestsSnapshot.forEach(requestDoc => {
        batch.update(requestDoc.ref, {
          status: 'revoked_by_admin',
          resolvedAt: FieldValue.serverTimestamp(),
          resolvedBy: requesterUid,
        });
      });
    }

    await batch.commit();
    console.log(`API (Req ID: ${reqId}): Batch commit SUCCESS. Student ${studentToRemoveId} unlinked from admin ${requesterUid}.`);

    // 6. Send notification email (optional, but good UX)
    if (studentProfileData.email) {
      const studentName = studentProfileData.displayName || 'Student';
      const adminName = adminProfileData.displayName || 'your admin';
      await sendEmail({
        to: studentProfileData.email,
        subject: `Update on your CertIntel Admin Link`,
        text: `Hello ${studentName},\n\nYour link with ${adminName} has been removed by them. You can now link with another admin from your profile settings if you wish.\n\nRegards,\nThe CertIntel Team`,
        html: `<p>Hello ${studentName},</p><p>Your link with <strong>${adminName}</strong> has been removed by them. You can now link with another admin from your profile settings if you wish.</p><p>Regards,<br/>The CertIntel Team</p>`,
      });
      console.log(`API (Req ID: ${reqId}): Notification email sent to student ${studentProfileData.email}.`);
    }

    return NextResponse.json({ success: true, message: 'Student unlinked successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/admin/remove-student-link (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    let status = 500;
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      status = 401;
    }
    // For debugging, send a more detailed message to the client.
    return NextResponse.json({ 
        message: `An internal server error occurred: ${error.message}`, 
        error: error.message, // Keep original error field for backward compat
        code: error.code, // Send code if available
    }, { status });
  }
}
