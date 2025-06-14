
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';
import { adminAuth } from '@/lib/firebase/adminConfig'; // Using Firebase Admin SDK
import { getAnyUserProfileWithAdmin } from '@/lib/services/userService'; // Using Admin SDK for profile fetch
import type { UserProfile } from '@/lib/models/user';

export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/user-images (Req ID: ${reqId}): GET request received. URL: ${request.url}`);

  const authorizationHeader = request.headers.get('Authorization');
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Missing or invalid Authorization header.`);
    return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.', errorKey: 'MISSING_ID_TOKEN' }, { status: 401 });
  }
  const idToken = authorizationHeader.split('Bearer ')[1];

  let decodedToken;
  try {
    if (!adminAuth || typeof adminAuth.verifyIdToken !== 'function') {
      console.error(`API Route /api/user-images (Req ID: ${reqId}): Firebase Admin Auth SDK not initialized.`);
      throw new Error("Firebase Admin Auth service not available.");
    }
    decodedToken = await adminAuth.verifyIdToken(idToken);
    console.log(`API Route /api/user-images (Req ID: ${reqId}): ID Token verified successfully for UID: ${decodedToken.uid}`);
  } catch (error: any) {
    console.error(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - ID Token verification failed:`, error.message);
    return NextResponse.json({ message: `Unauthorized: Invalid ID token. ${error.code || ''}`, errorKey: 'INVALID_ID_TOKEN', detail: error.message }, { status: 401 });
  }

  const authenticatedUserId = decodedToken.uid; // This is the UID of the user making the request (the admin)
  const targetUserId = request.nextUrl.searchParams.get('userId'); // Student's UID
  const adminRequesterIdFromQuery = request.nextUrl.searchParams.get('adminRequesterId'); // Admin's UID from query (for self-consistency check)

  console.log(`API Route /api/user-images (Req ID: ${reqId}): AuthenticatedUID (from token): ${authenticatedUserId}, TargetStudentUID (query): ${targetUserId}, AdminRequesterUID (query): ${adminRequesterIdFromQuery}`);


  if (authenticatedUserId !== adminRequesterIdFromQuery) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Token UID (${authenticatedUserId}) does not match adminRequesterId query param (${adminRequesterIdFromQuery}). This is a critical mismatch.`);
    return NextResponse.json({ message: 'Unauthorized: Mismatch in authenticated user and requester ID.', errorKey: 'TOKEN_QUERY_PARAM_UID_MISMATCH' }, { status: 403 });
  }

  if (!targetUserId) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): FAIL - targetUserId query parameter is required.`);
    return NextResponse.json({ message: 'targetUserId query parameter is required.', errorKey: 'MISSING_TARGET_USER_ID' }, { status: 400 });
  }

  let dbConnection;
  try {
    // Authorization Check using Admin SDK to fetch profiles
    console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Fetching admin profile for UID: ${authenticatedUserId} using Admin SDK...`);
    const adminProfile: UserProfile | null = await getAnyUserProfileWithAdmin(authenticatedUserId);
    
    if (!adminProfile) {
      console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Admin profile for ${authenticatedUserId} NOT FOUND in Firestore (via Admin SDK).`);
      return NextResponse.json({ message: 'Unauthorized: Admin identity could not be verified (profile not found).', errorKey: 'ADMIN_PROFILE_NOT_FOUND' }, { status: 403 });
    }
    console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Admin profile fetched. UID: ${adminProfile.uid}, Role: '${adminProfile.role}', DisplayName: ${adminProfile.displayName}`);
    
    if (adminProfile.role !== 'admin') {
      console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Requester ${authenticatedUserId} is NOT an admin. Actual role: '${adminProfile.role}'.`);
      return NextResponse.json({ message: 'Unauthorized: Requester does not have admin privileges.', errorKey: 'NOT_AN_ADMIN' }, { status: 403 });
    }
    console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Admin role VERIFIED for ${authenticatedUserId}. Fetching target student profile ${targetUserId} using Admin SDK...`);

    const targetUserProfile: UserProfile | null = await getAnyUserProfileWithAdmin(targetUserId);
    if (!targetUserProfile) {
      console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Target student profile ${targetUserId} NOT FOUND in Firestore (via Admin SDK).`);
      return NextResponse.json({ message: 'Unauthorized: Student profile not found.', errorKey: 'STUDENT_PROFILE_NOT_FOUND' }, { status: 403 });
    }
    console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Student profile fetched. UID: ${targetUserProfile.uid}, Role: '${targetUserProfile.role}', LinkedAdminFirebaseId: '${targetUserProfile.associatedAdminFirebaseId}', LinkStatus: '${targetUserProfile.linkRequestStatus}'`);

    if (targetUserProfile.role !== 'student') {
      console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Target user ${targetUserId} is not a student. Actual role: '${targetUserProfile.role}'.`);
      return NextResponse.json({ message: 'Unauthorized: Target user is not registered as a student.', errorKey: 'TARGET_NOT_STUDENT'}, { status: 403 });
    }

    if (targetUserProfile.associatedAdminFirebaseId !== authenticatedUserId) {
      console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Student ${targetUserId} is not linked to requesting admin ${authenticatedUserId}. Student's linked admin UID: '${targetUserProfile.associatedAdminFirebaseId}'.`);
      return NextResponse.json({ message: 'Unauthorized: Admin is not linked to this student.', errorKey: 'ADMIN_STUDENT_LINK_INVALID_UID' }, { status: 403 });
    }
    
    if (targetUserProfile.linkRequestStatus !== 'accepted') {
      console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Student ${targetUserId} link status with admin ${authenticatedUserId} is not 'accepted'. Actual status: '${targetUserProfile.linkRequestStatus}'.`);
      return NextResponse.json({ message: 'Unauthorized: Student link request not in accepted state.', errorKey: 'ADMIN_STUDENT_LINK_NOT_ACCEPTED' }, { status: 403 });
    }
    
    console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH SUCCESS - Admin ${authenticatedUserId} fully authorized for student ${targetUserId}. Proceeding to MongoDB for image list.`);

    // Connect to MongoDB to get image list
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Attempting to connect to DB for MongoDB image fetch...`);
    dbConnection = await connectToDb(); // This handles MongoDB connection
    const { db } = dbConnection;
    console.log(`API Route /api/user-images (Req ID: ${reqId}): DB connected successfully. Accessing 'images.files' collection for MongoDB query.`);

    const filesCollection = db.collection('images.files');
    const query = { 'metadata.userId': targetUserId }; 
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

    console.log(`API Route /api/user-images (Req ID: ${reqId}): Found ${userImages.length} images for targetUserId ${targetUserId} from MongoDB.`);

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
    } else if (error.message && (error.message.includes('Unauthorized') || error.message.includes('Access Denied') || error.message.includes('profile not found'))) {
      responseMessage = error.message; 
      errorKey = (error as any).errorKey || 'UNAUTHORIZED_ACCESS_DETAIL_IN_MESSAGE'; 
      statusCode = 403;
    } else if (error.message && error.message.includes('Admin Firestore service not available') || error.message.includes('Firebase Admin Auth service not available')) {
      responseMessage = 'Server configuration error: Firebase Admin services not ready.';
      errorKey = 'ADMIN_SDK_NOT_READY';
      statusCode = 503; // Service Unavailable
    }
    else if (error.message) {
        responseMessage = error.message;
    }

    const errorPayload = { message: responseMessage, errorKey, detail: error.message };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: statusCode });
  }
}
