
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
      // An admin is requesting another user's images. Verify admin role and linkage.
      const adminProfile = await getUserProfile(adminRequesterId);
      if (!adminProfile || adminProfile.role !== 'admin') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): Unauthorized. Requester ${adminRequesterId} is not an admin.`);
        return NextResponse.json({ message: 'Unauthorized: Requester is not an admin.', errorKey: 'NOT_AN_ADMIN' }, { status: 403 });
      }

      // Now check if the targetUser (student) is actually linked to this admin
      const targetUserProfile = await getUserProfile(targetUserId);
      if (!targetUserProfile || targetUserProfile.role !== 'student' || targetUserProfile.associatedAdminFirebaseId !== adminRequesterId || targetUserProfile.linkRequestStatus !== 'accepted') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): Admin ${adminRequesterId} not authorized to view images for user ${targetUserId}. Linkage invalid or student role incorrect.`);
        return NextResponse.json({ message: 'Unauthorized: Admin not linked to this student or student role invalid.', errorKey: 'ADMIN_STUDENT_LINK_INVALID' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Admin ${adminRequesterId} authorized to view images for student ${targetUserId}.`);
    } else if (!adminRequesterId && !request.headers.get('X-Internal-Call')) { 
      // If no adminRequesterId, it implies user is fetching their own images.
      // This requires authentication check, typically done via middleware verifying an ID token.
      // For this project, direct user-image access might be simpler if client sends their own UID as targetUserId.
      // The ProtectedPage component client-side ensures only logged-in users can reach pages that call this.
      // A more robust check here would involve verifying a Firebase ID token if passed in headers.
      // For now, we assume if adminRequesterId is missing, it's the user themselves.
      // The X-Internal-Call header is a hypothetical way to allow server-to-server calls without auth if needed.
      console.log(`API Route /api/user-images (Req ID: ${reqId}): Assuming user ${targetUserId} is fetching their own images. (No adminRequesterId)`);
    }


    console.log(`API Route /api/user-images (Req ID: ${reqId}): Attempting to connect to DB...`);
    dbConnection = await connectToDb();
    const { db } = dbConnection;
    console.log(`API Route /api/user-images (Req ID: ${reqId}): DB connected successfully. Accessing 'images.files' collection.`);

    const filesCollection = db.collection('images.files');
    const query = { 'metadata.userId': targetUserId }; // Query by the actual owner of the image
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

    console.log(`API Route /api/user-images (Req ID: ${reqId}): Found ${userImages.length} images for targetUserId ${targetUserId}.`);

    const formattedImages = userImages.map(img => ({
      fileId: img._id.toString(),
      filename: img.filename,
      uploadDate: img.uploadDate as string, 
      contentType: img.contentType,
      originalName: img.metadata?.originalName || img.filename,
      dataAiHint: img.metadata?.dataAiHint || '',
      size: img.length || 0,
      userId: img.metadata?.userId, // This is the student's/owner's UID
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
    } else if (error.message && (error.message.includes('Unauthorized') || error.message.includes('Access Denied'))) {
      responseMessage = error.message;
      errorKey = 'UNAUTHORIZED_ACCESS';
      statusCode = 403;
    } else if (error.message) {
        responseMessage = error.message;
    }

    const errorPayload = { message: responseMessage, errorKey, detail: error.message };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: statusCode });
  }
}
