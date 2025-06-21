
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminConfig';
import { FieldValue } from 'firebase-admin/firestore';
import type { StudentLinkRequest, UserProfile } from '@/lib/models/user';
import { sendEmail } from '@/lib/emailUtils';

const USERS_COLLECTION = 'users';
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/admin/resolve-link-request (Req ID: ${reqId}): POST request received.`);

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
    const { requestId, newStatus } = await request.json();
    if (!requestId || !newStatus || !['accepted', 'rejected'].includes(newStatus)) {
      console.warn(`API (Req ID: ${reqId}): FAIL - Invalid body. RequestId: ${requestId}, NewStatus: ${newStatus}`);
      return NextResponse.json({ message: 'requestId and newStatus ("accepted" or "rejected") are required.' }, { status: 400 });
    }
    console.log(`API (Req ID: ${reqId}): Attempting to resolve request ${requestId} to status ${newStatus} by admin ${requesterUid}`);

    // 3. Get the request document and authorize the admin
    const requestDocRef = adminFirestore.collection(STUDENT_LINK_REQUESTS_COLLECTION).doc(requestId);
    const requestSnap = await requestDocRef.get();
    if (!requestSnap.exists) {
        console.warn(`API (Req ID: ${reqId}): Link request ${requestId} not found.`);
        return NextResponse.json({ message: 'Link request not found.' }, { status: 404 });
    }
    const requestData = requestSnap.data() as StudentLinkRequest;

    if (requestData.adminFirebaseId !== requesterUid) {
        console.warn(`API (Req ID: ${reqId}): AUTH FAIL - Admin ${requesterUid} is not the target admin for request ${requestId}. Target was ${requestData.adminFirebaseId}.`);
        return NextResponse.json({ message: 'Forbidden: You are not authorized to resolve this request.' }, { status: 403 });
    }
    if (requestData.status !== 'pending') {
        return NextResponse.json({ message: `Request has already been resolved with status: ${requestData.status}.` }, { status: 409 }); // Conflict
    }

    // 4. Perform the batched write
    const batch = adminFirestore.batch();
    const studentUserDocRef = adminFirestore.collection(USERS_COLLECTION).doc(requestData.studentUserId);

    batch.update(requestDocRef, {
        status: newStatus,
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedBy: requesterUid,
    });
    
    const studentUpdateData: { [key: string]: any } = {
        linkRequestStatus: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
    };

    if (newStatus === 'accepted') {
        studentUpdateData.associatedAdminFirebaseId = requesterUid;
        studentUpdateData.associatedAdminUniqueId = requestData.adminUniqueIdTargeted;
    } else { // rejected
        studentUpdateData.associatedAdminFirebaseId = null;
        studentUpdateData.associatedAdminUniqueId = null;
    }
    batch.update(studentUserDocRef, studentUpdateData);
    await batch.commit();
    console.log(`API (Req ID: ${reqId}): Batch commit SUCCESS. Request ${requestId} resolved to ${newStatus}.`);

    // 5. Send notification email
    const studentName = requestData.studentName || requestData.studentEmail.split('@')[0];
    let emailSubject = '';
    let emailText = '';
    let emailHtml = '';

    if (newStatus === 'accepted') {
      emailSubject = 'Your Link Request to CertIntel Admin Was Approved!';
      emailText = `Hello ${studentName},\n\nYour request to link with the CertIntel admin (${requestData.adminUniqueIdTargeted}) has been approved. You are now linked.\n\nRegards,\nThe CertIntel Team`;
      emailHtml = `<p>Hello ${studentName},</p><p>Your request to link with the CertIntel admin (ID: <strong>${requestData.adminUniqueIdTargeted}</strong>) has been <strong>approved</strong>. You are now linked.</p><p>Regards,<br/>The CertIntel Team</p>`;
    } else { // rejected
      emailSubject = 'Update on Your CertIntel Admin Link Request';
      emailText = `Hello ${studentName},\n\nUnfortunately, your request to link with the CertIntel admin (${requestData.adminUniqueIdTargeted}) was not approved at this time.\n\nIf you believe this is an error, please contact your admin or try requesting again.\n\nRegards,\nThe CertIntel Team`;
      emailHtml = `<p>Hello ${studentName},</p><p>Unfortunately, your request to link with the CertIntel admin (ID: <strong>${requestData.adminUniqueIdTargeted}</strong>) was <strong>not approved</strong> at this time.</p><p>If you believe this is an error, please contact your admin or try requesting again.</p><p>Regards,<br/>The CertIntel Team</p>`;
    }

     if (requestData.studentEmail && emailSubject) {
      await sendEmail({
        to: requestData.studentEmail,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      });
      console.log(`API (Req ID: ${reqId}): Notification email sent to student ${requestData.studentEmail}.`);
    }

    return NextResponse.json({ success: true, message: `Request ${newStatus} successfully.` }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/admin/resolve-link-request (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    return NextResponse.json({ message: `An internal server error occurred: ${error.message}` }, { status: 500 });
  }
}
