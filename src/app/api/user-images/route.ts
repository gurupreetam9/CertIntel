
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';
import { adminAuth, adminFirestore } from '@/lib/firebase/adminConfig'; 
import type { UserProfile } from '@/lib/models/user';

const USERS_COLLECTION = 'users';

// Local implementation of getAnyUserProfileWithAdmin for this API route
const getAnyUserProfileWithAdminLocally = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) {
    console.warn("user-images API (getAnyUserProfileWithAdminLocally): Called with no userId.");
    return null;
  }
  if (!adminFirestore || typeof adminFirestore.collection !== 'function') {
    console.error("user-images API (getAnyUserProfileWithAdminLocally): adminFirestore is not initialized properly.");
    throw new Error("Admin Firestore service not available.");
  }
  try {
    const userDocRef = adminFirestore.collection(USERS_COLLECTION).doc(userId);
    const userDocSnap = await userDocRef.get();
    if (userDocSnap.exists) {
      return userDocSnap.data() as UserProfile;
    }
    console.log(`user-images API (getAnyUserProfileWithAdminLocally): No profile found for userId ${userId}.`);
    return null;
  } catch (error: any) {
    console.error(`user-images API (getAnyUserProfileWithAdminLocally): Error fetching profile for UID ${userId}:`, error.message, error);
    throw error; 
  }
};


export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/user-images (Req ID: ${reqId}): GET request received. URL: ${request.url}`);

  const authorizationHeader = request.headers.get('Authorization');
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Missing or invalid Authorization header.`);
    return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.', errorKey: 'MISSING_ID_TOKEN' }, { status: 401 });
  }
  const idToken = authorizationHeader.split('Bearer ')[1];
  console.log(`API Route /api/user-images (Req ID: ${reqId}): Received token (first 15 chars): Bearer ${idToken.substring(0,15)}...`);


  let decodedToken;
  try {
    if (!adminAuth || typeof adminAuth.verifyIdToken !== 'function') {
      console.error(`API Route /api/user-images (Req ID: ${reqId}): Firebase Admin Auth SDK not initialized.`);
      return NextResponse.json({ message: 'Server error: Authentication service not available.', errorKey: 'ADMIN_AUTH_NOT_INIT' }, { status: 503 });
    }
    decodedToken = await adminAuth.verifyIdToken(idToken);
    console.log(`API Route /api/user-images (Req ID: ${reqId}): ID Token verified successfully for UID: ${decodedToken.uid}`);
  } catch (error: any) {
    console.error(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - ID Token verification failed:`, { message: error.message, code: error.code });
    return NextResponse.json({ message: `Unauthorized: Invalid ID token. Details: ${error.message}`, errorKey: 'INVALID_ID_TOKEN', detail: error.message, code: error.code }, { status: 401 });
  }

  const requesterUid = decodedToken.uid; 
  const targetUserId = request.nextUrl.searchParams.get('userId'); 
  const adminIdFromQuery = request.nextUrl.searchParams.get('adminRequesterId'); 

  console.log(`API Route /api/user-images (Req ID: ${reqId}): RequesterUID (from token): ${requesterUid}, TargetUserUID (query): ${targetUserId}, AdminID (query): ${adminIdFromQuery}`);

  if (!targetUserId) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): FAIL - targetUserId query parameter is required.`);
    return NextResponse.json({ message: 'targetUserId query parameter is required.', errorKey: 'MISSING_TARGET_USER_ID' }, { status: 400 });
  }

  let dbConnection;
  try {
    let authorizedToFetch = false;
    let finalTargetUserId = targetUserId; 

    if (adminIdFromQuery) {
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Admin access scenario detected. AdminID from query: ${adminIdFromQuery}`);
      if (requesterUid !== adminIdFromQuery) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Admin) - Token UID (${requesterUid}) does not match adminRequesterId query param (${adminIdFromQuery}).`);
        return NextResponse.json({ message: 'Forbidden: Mismatch in authenticated user and admin requester ID.', errorKey: 'TOKEN_QUERY_PARAM_UID_MISMATCH_ADMIN' }, { status: 403 });
      }

      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH (Admin) - Fetching admin profile for UID: ${requesterUid} using Admin SDK...`);
      const adminProfile = await getAnyUserProfileWithAdminLocally(requesterUid);
      
      if (!adminProfile) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Admin) - Admin profile for ${requesterUid} NOT FOUND.`);
        return NextResponse.json({ message: 'Forbidden: Admin identity could not be verified (profile not found).', errorKey: 'ADMIN_PROFILE_NOT_FOUND' }, { status: 403 });
      }
      if (adminProfile.role !== 'admin') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Admin) - Requester ${requesterUid} is NOT an admin. Actual role: '${adminProfile.role}'.`);
        return NextResponse.json({ message: 'Forbidden: Requester does not have admin privileges.', errorKey: 'NOT_AN_ADMIN' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH (Admin) - Admin role VERIFIED for ${requesterUid}. Fetching target student profile ${targetUserId}...`);

      const studentProfile = await getAnyUserProfileWithAdminLocally(targetUserId);
      if (!studentProfile) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Admin) - Target student profile ${targetUserId} NOT FOUND.`);
        return NextResponse.json({ message: 'Forbidden: Student profile not found.', errorKey: 'STUDENT_PROFILE_NOT_FOUND' }, { status: 403 });
      }
      if (studentProfile.role !== 'student') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Admin) - Target user ${targetUserId} is not a student. Actual role: '${studentProfile.role}'.`);
        return NextResponse.json({ message: 'Forbidden: Target user is not registered as a student.', errorKey: 'TARGET_NOT_STUDENT'}, { status: 403 });
      }
      if (studentProfile.associatedAdminFirebaseId !== requesterUid || studentProfile.linkRequestStatus !== 'accepted') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Admin) - Student ${targetUserId} is not linked or link not accepted by admin ${requesterUid}. LinkedAdmin: '${studentProfile.associatedAdminFirebaseId}', Status: '${studentProfile.linkRequestStatus}'.`);
        return NextResponse.json({ message: 'Forbidden: Admin is not linked to this student or link not accepted.', errorKey: 'ADMIN_STUDENT_LINK_INVALID' }, { status: 403 });
      }
      authorizedToFetch = true;
      finalTargetUserId = targetUserId; 
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH SUCCESS (Admin) - Admin ${requesterUid} authorized for student ${finalTargetUserId}.`);

    } else {
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Self-access scenario detected (no adminIdFromQuery).`);
      if (requesterUid !== targetUserId) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL (Self) - Requester UID (${requesterUid}) does not match targetUserId (${targetUserId}).`);
        return NextResponse.json({ message: 'Forbidden: You can only access your own images.', errorKey: 'SELF_ACCESS_UID_MISMATCH' }, { status: 403 });
      }
      authorizedToFetch = true;
      finalTargetUserId = requesterUid; 
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH SUCCESS (Self) - User ${requesterUid} authorized for own images (target ${finalTargetUserId}).`);
    }

    if (!authorizedToFetch) {
      console.error(`API Route /api/user-images (Req ID: ${reqId}): CRITICAL AUTH LOGIC FAIL - Reached end of auth checks without explicit authorization. This should not happen.`);
      return NextResponse.json({ message: 'Forbidden: Access denied due to an internal authorization error.', errorKey: 'INTERNAL_AUTH_ERROR' }, { status: 403 });
    }
    
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Attempting to connect to DB for MongoDB image fetch for user ${finalTargetUserId}...`);
    dbConnection = await connectToDb();
    const { db } = dbConnection;
    console.log(`API Route /api/user-images (Req ID: ${reqId}): DB connected. Accessing 'images.files' for user ${finalTargetUserId}.`);

    const filesCollection = db.collection('images.files');
    const query = { 'metadata.userId': finalTargetUserId }; 
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Querying 'images.files' with:`, query);

    const userImages = await filesCollection.find(
      query,
      {
        projection: {
          _id: 1,
          filename: 1,
          uploadDate: 1,
          contentType: 1,
          length: 1,
          metadata: 1
        }
      }
    ).sort({ uploadDate: -1 }).toArray();

    console.log(`API Route /api/user-images (Req ID: ${reqId}): Found ${userImages.length} images for user ${finalTargetUserId} from MongoDB.`);

    const formattedImages = userImages.map(img => ({
      fileId: img._id.toString(),
      filename: img.filename,
      uploadDate: img.uploadDate as string, 
      contentType: img.contentType,
      originalName: img.metadata?.originalName || img.filename,
      dataAiHint: img.metadata?.dataAiHint || '',
      size: img.length || 0,
      userId: img.metadata?.userId, 
    }));

    return NextResponse.json(formattedImages, { status: 200 });

  } catch (error: any) {
    console.error(`API Route /api/user-images (Req ID: ${reqId}): ERROR during image fetching process. Name: ${error.name}, Message: ${error.message}`);
    if (error.stack) {
        console.error(`API Route /api/user-images (Req ID: ${reqId}): Error stack (first 500 chars): ${error.stack.substring(0,500)}...`);
    }

    let responseMessage = 'Error fetching user images.';
    let errorKey = 'FETCH_IMAGES_FAILED';
    let statusCode = 500;

    if (error.message && error.message.toLowerCase().includes('mongodb connection error')) {
      responseMessage = 'Database connection error.';
      errorKey = 'DB_CONNECTION_ERROR';
    } else if (error.message && (error.message.includes('Forbidden') || error.message.includes('Access Denied'))) {
      responseMessage = error.message; 
      errorKey = (error as any).errorKey || 'FORBIDDEN_ACCESS_DETAIL_IN_MESSAGE'; 
      statusCode = 403;
    } else if (error.message && error.message.includes('Admin Firestore service not available') || error.message.includes('Firebase Admin Auth service not available')) {
      responseMessage = 'Server configuration error: Firebase Admin services not ready.';
      errorKey = 'ADMIN_SDK_NOT_READY';
      statusCode = 503; 
    }
    else if (error.message) {
        responseMessage = error.message;
    }

    const errorPayload = { message: responseMessage, errorKey, detail: error.message };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: statusCode });
  }
}

