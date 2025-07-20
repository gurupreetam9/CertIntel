
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminConfig';
import { Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

const DELETION_TOKENS_COLLECTION = 'deletionTokens';



export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/account/delete-confirmed (Req ID: ${reqId}): POST request received.`);

  try {
    const { token } = await request.json();
    if (!token) {
        return NextResponse.json({ message: 'Deletion token is required.' }, { status: 400 });
    }
    
    const adminFirestore = getAdminFirestore();
    const tokenDocRef = adminFirestore.collection(DELETION_TOKENS_COLLECTION).doc(token);
    const tokenDoc = await tokenDocRef.get();

    if (!tokenDoc.exists) {
        return NextResponse.json({ message: 'Invalid or expired deletion token.' }, { status: 400 });
    }
    
    const storedEntry = tokenDoc.data();
    // Firestore Timestamp objects have a toDate() method
    if (Date.now() > (storedEntry?.expiresAt as Timestamp).toDate().getTime()) {
        await tokenDocRef.delete(); // Clean up expired token
        return NextResponse.json({ message: 'Deletion token has expired. Please try again.' }, { status: 400 });
    }

    const { userId } = storedEntry!;

    // In a real app, you would also trigger deletion of user's data from GridFS and other collections.
    // This is a complex, long-running task and should be handled by a background function (e.g., Cloud Function).
    // For this prototype, we'll delete the Auth user and Firestore profile.
    
    const adminAuth = getAdminAuth();

    console.log(`API (Req ID: ${reqId}): Deleting user from Firebase Auth. UID: ${userId}`);
    await adminAuth.deleteUser(userId);
    
    console.log(`API (Req ID: ${reqId}): Deleting user profile from Firestore. UID: ${userId}`);
    await adminFirestore.collection('users').doc(userId).delete();

    // Invalidate the token after use by deleting it from Firestore
    await tokenDocRef.delete();
    
    console.log(`API (Req ID: ${reqId}): Successfully deleted user ${userId}.`);
    return NextResponse.json({ success: true, message: 'Your account has been successfully deleted.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/account/delete-confirmed (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });

    let errorMessage = 'An internal server error occurred while deleting your account.';
    if (error.code === 'auth/user-not-found') {
        errorMessage = "The user may have already been deleted. If you see this, the deletion was likely successful."
    }

    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
