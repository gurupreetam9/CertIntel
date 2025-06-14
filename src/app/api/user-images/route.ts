
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';
import { getUserProfile } from '@/lib/services/userService'; // For checking admin roles

export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/user-images (Req ID: ${reqId}): GET request received.`);

  const targetUserId = request.nextUrl.searchParams.get('userId'); // This is the user whose images are being requested
  const adminRequesterId = request.nextUrl.searchParams.get('adminRequesterId'); // UID of admin making request, if any

  console.log(`API Route /api/user-images (Req ID: ${reqId}): Target userId: ${targetUserId}, AdminRequesterId: ${adminRequesterId}`);

  if (!targetUserId) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): targetUserId query parameter is required.`);
    return NextResponse.json({ message: 'targetUserId query parameter is required.', errorKey: 'MISSING_TARGET_USER_ID' }, { status: 400 });
  }

  let dbConnection;
  try {
    // Authorization Check
    if (adminRequesterId && adminRequesterId !== targetUserId) {
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Admin ${adminRequesterId} is requesting images for student ${targetUserId}. Fetching admin profile...`);
      const adminProfile = await getUserProfile(adminRequesterId);
      if (!adminProfile) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): Admin profile for ${adminRequesterId} not found or access denied by Firestore rules.`);
        return NextResponse.json({ message: 'Unauthorized: Admin profile not found or inaccessible.', errorKey: 'ADMIN_PROFILE_INACCESSIBLE' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Admin profile fetched. Role: ${adminProfile.role}`);
      if (adminProfile.role !== 'admin') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): Unauthorized. Requester ${adminRequesterId} is not an admin (role: ${adminProfile.role}).`);
        return NextResponse.json({ message: 'Unauthorized: Requester is not an admin.', errorKey: 'NOT_AN_ADMIN' }, { status: 403 });
      }

      console.log(`API Route /api/user-images (Req ID: ${reqId}): Admin confirmed. Fetching target student profile ${targetUserId}...`);
      const targetUserProfile = await getUserProfile(targetUserId);
      if (!targetUserProfile) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): Target student profile ${targetUserId} not found or access denied by Firestore rules.`);
        return NextResponse.json({ message: 'Unauthorized: Student profile not found or inaccessible.', errorKey: 'STUDENT_PROFILE_INACCESSIBLE' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Student profile fetched. Role: ${targetUserProfile.role}, LinkedAdmin: ${targetUserProfile.associatedAdminFirebaseId}, LinkStatus: ${targetUserProfile.linkRequestStatus}`);

      if (targetUserProfile.role !== 'student' || targetUserProfile.associatedAdminFirebaseId !== adminRequesterId || targetUserProfile.linkRequestStatus !== 'accepted') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): Admin ${adminRequesterId} not authorized to view images for user ${targetUserId}. Linkage invalid or student role incorrect. Student role: ${targetUserProfile.role}, Linked Admin: ${targetUserProfile.associatedAdminFirebaseId}, Link Status: ${targetUserProfile.linkRequestStatus}`);
        return NextResponse.json({ message: 'Unauthorized: Admin not linked to this student or student role invalid.', errorKey: 'ADMIN_STUDENT_LINK_INVALID' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Admin ${adminRequesterId} authorized to view images for student ${targetUserId}. Proceeding to fetch from MongoDB.`);
    } else if (!adminRequesterId && !request.headers.get('X-Internal-Call')) { 
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Assuming user ${targetUserId} is fetching their own images. (No adminRequesterId)`);
      // Further checks might be needed here if users can only fetch their own images directly.
      // For now, assuming the main protection is via ProtectedPage on the client.
    }


    console.log(`API Route /api/user-images (Req ID: ${reqId}): Attempting to connect to DB for MongoDB image fetch...`);
    dbConnection = await connectToDb();
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
    console.error(`API Route /api/user-images (Req ID: ${reqId}): Error during image fetching process. Name: ${error.name}, Message: ${error.message}`);
    if (error.stack) {
        console.error(`API Route /api/user-images (Req ID: ${reqId}): Error stack (first 500 chars): ${error.stack.substring(0,500)}...`);
    }

    let responseMessage = 'Error fetching user images.';
    let errorKey = 'FETCH_IMAGES_FAILED';
    let statusCode = 500;

    if (error.message && error.message.toLowerCase().includes('mongodb connection error')) {
      responseMessage = 'Database connection error.';
      errorKey = 'DB_CONNECTION_ERROR';
    } else if (error.message && (error.message.includes('Unauthorized') || error.message.includes('Access Denied') || error.message.includes('profile not found or inaccessible'))) {
      responseMessage = error.message; // Use the more specific message from the try block.
      errorKey = error.errorKey || 'UNAUTHORIZED_ACCESS'; // If errorKey was set in the try block.
      statusCode = 403;
    } else if (error.message) {
        responseMessage = error.message;
    }

    const errorPayload = { message: responseMessage, errorKey, detail: error.message };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: statusCode });
  }
}
