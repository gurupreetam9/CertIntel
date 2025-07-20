
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminConfig';
import { connectToDb } from '@/lib/mongodb';
import { Timestamp } from 'firebase-admin/firestore';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

const DELETION_TOKENS_COLLECTION = 'deletionTokens';
const USERS_COLLECTION = 'users';
const USER_COURSE_PROCESSING_RESULTS_COLLECTION = 'user_course_processing_results';
const GRIDFS_IMAGES_FILES_COLLECTION = 'images.files';
const GRIDFS_IMAGES_CHUNKS_COLLECTION = 'images.chunks';



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
    if (Date.now() > (storedEntry?.expiresAt as Timestamp).toDate().getTime()) {
        await tokenDocRef.delete();
        return NextResponse.json({ message: 'Deletion token has expired. Please try again.' }, { status: 400 });
    }

    const { userId } = storedEntry!;

    if (!userId) {
        return NextResponse.json({ message: 'Invalid token data. User ID missing.' }, { status: 400 });
    }

    const { db } = await connectToDb();
    
    const adminAuth = getAdminAuth();
    
    // ---- Step 1: Revoke all refresh tokens to invalidate all active user sessions ----
    console.log(`API (Req ID: ${reqId}): Revoking all refresh tokens for UID: ${userId} to invalidate sessions.`);
    await adminAuth.revokeRefreshTokens(userId);
    console.log(`API (Req ID: ${reqId}): Refresh tokens revoked for UID: ${userId}.`);

    // ---- Step 2: Delete user data from MongoDB GridFS ----
    const userFilesCursor = db.collection(GRIDFS_IMAGES_FILES_COLLECTION).find({ 'metadata.userId': userId }, { projection: { _id: 1 } });
    const userFileIds = await userFilesCursor.map(doc => doc._id).toArray();
    
    if (userFileIds.length > 0) {
      console.log(`API (Req ID: ${reqId}): Found ${userFileIds.length} files in GridFS for UID: ${userId}. Deleting files and chunks.`);
      const objectIds = userFileIds.map(id => new ObjectId(id));
      await db.collection(GRIDFS_IMAGES_CHUNKS_COLLECTION).deleteMany({ files_id: { $in: objectIds } });
      await db.collection(GRIDFS_IMAGES_FILES_COLLECTION).deleteMany({ _id: { $in: objectIds } });
      console.log(`API (Req ID: ${reqId}): Deleted GridFS files and chunks for UID: ${userId}.`);
    } else {
      console.log(`API (Req ID: ${reqId}): No GridFS files found for UID: ${userId}.`);
    }

    // ---- Step 3: Delete user data from MongoDB 'user_course_processing_results' collection ----
    console.log(`API (Req ID: ${reqId}): Deleting documents from '${USER_COURSE_PROCESSING_RESULTS_COLLECTION}' for UID: ${userId}.`);
    const deletionResult = await db.collection(USER_COURSE_PROCESSING_RESULTS_COLLECTION).deleteMany({ userId: userId });
    console.log(`API (Req ID: ${reqId}): Deleted ${deletionResult.deletedCount} documents from '${USER_COURSE_PROCESSING_RESULTS_COLLECTION}'.`);

    // ---- Step 4: Delete user profile from Firestore ----
    console.log(`API (Req ID: ${reqId}): Deleting user profile from Firestore. UID: ${userId}`);
    await adminFirestore.collection(USERS_COLLECTION).doc(userId).delete();
    
    // ---- Step 5: Delete user from Firebase Auth ----

    console.log(`API (Req ID: ${reqId}): Deleting user from Firebase Auth. UID: ${userId}`);
    await adminAuth.deleteUser(userId);
    
    console.log(`API (Req ID: ${reqId}): Deleting user profile from Firestore. UID: ${userId}`);
    await adminFirestore.collection('users').doc(userId).delete();

    // ---- Step 6: Invalidate the token after use ----
    await tokenDocRef.delete();
    
    console.log(`API (Req ID: ${reqId}): Successfully and completely deleted user ${userId}.`);
    return NextResponse.json({ success: true, message: 'Your account and all associated data have been successfully deleted.' }, { status: 200 });

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
