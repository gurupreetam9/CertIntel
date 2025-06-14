
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';
import { getUserProfile } from '@/lib/services/userService'; // For checking admin roles

export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/user-images (Req ID: ${reqId}): GET request received. URL: ${request.url}`);

  const targetUserId = request.nextUrl.searchParams.get('userId'); // This is the user whose images are being requested
  const adminRequesterId = request.nextUrl.searchParams.get('adminRequesterId'); // UID of admin making request, if any

  console.log(`API Route /api/user-images (Req ID: ${reqId}): Target userId: ${targetUserId}, AdminRequesterId: ${adminRequesterId}`);

  if (!targetUserId) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): FAIL - targetUserId query parameter is required.`);
    return NextResponse.json({ message: 'targetUserId query parameter is required.', errorKey: 'MISSING_TARGET_USER_ID' }, { status: 400 });
  }

  let dbConnection;
  try {
    // Authorization Check
    if (adminRequesterId && adminRequesterId !== targetUserId) {
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Admin access attempt by ${adminRequesterId} for student ${targetUserId}. Fetching admin profile...`);
      const adminProfile = await getUserProfile(adminRequesterId);
      
      if (!adminProfile) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Admin profile for ${adminRequesterId} NOT FOUND in Firestore.`);
        return NextResponse.json({ message: 'Unauthorized: Admin identity could not be verified (profile not found).', errorKey: 'ADMIN_PROFILE_NOT_FOUND' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Admin profile fetched. UID: ${adminProfile.uid}, Role: '${adminProfile.role}', DisplayName: ${adminProfile.displayName}`);
      
      if (adminProfile.role !== 'admin') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Requester ${adminRequesterId} is NOT an admin. Actual role: '${adminProfile.role}'.`);
        return NextResponse.json({ message: 'Unauthorized: Requester does not have admin privileges.', errorKey: 'NOT_AN_ADMIN' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Admin role VERIFIED for ${adminRequesterId}. Fetching target student profile ${targetUserId}...`);

      const targetUserProfile = await getUserProfile(targetUserId);
      if (!targetUserProfile) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Target student profile ${targetUserId} NOT FOUND in Firestore.`);
        return NextResponse.json({ message: 'Unauthorized: Student profile not found.', errorKey: 'STUDENT_PROFILE_NOT_FOUND' }, { status: 403 });
      }
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Student profile fetched. UID: ${targetUserProfile.uid}, Role: '${targetUserProfile.role}', LinkedAdminFirebaseId: '${targetUserProfile.associatedAdminFirebaseId}', LinkStatus: '${targetUserProfile.linkRequestStatus}'`);

      if (targetUserProfile.role !== 'student') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Target user ${targetUserId} is not a student. Actual role: '${targetUserProfile.role}'.`);
        return NextResponse.json({ message: 'Unauthorized: Target user is not registered as a student.', errorKey: 'TARGET_NOT_STUDENT'}, { status: 403 });
      }

      if (targetUserProfile.associatedAdminFirebaseId !== adminRequesterId) {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Student ${targetUserId} is not linked to requesting admin ${adminRequesterId}. Student's linked admin UID: '${targetUserProfile.associatedAdminFirebaseId}'.`);
        return NextResponse.json({ message: 'Unauthorized: Admin is not linked to this student.', errorKey: 'ADMIN_STUDENT_LINK_INVALID_UID' }, { status: 403 });
      }
      
      if (targetUserProfile.linkRequestStatus !== 'accepted') {
        console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH FAIL - Student ${targetUserId} link status with admin ${adminRequesterId} is not 'accepted'. Actual status: '${targetUserProfile.linkRequestStatus}'.`);
        return NextResponse.json({ message: 'Unauthorized: Student link request not in accepted state.', errorKey: 'ADMIN_STUDENT_LINK_NOT_ACCEPTED' }, { status: 403 });
      }
      
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH SUCCESS - Admin ${adminRequesterId} fully authorized for student ${targetUserId}. Proceeding to MongoDB.`);

    } else if (!adminRequesterId && targetUserId) {
      // This case is for a user fetching their OWN images.
      // Requires that targetUserId is the UID of the *currently authenticated user*.
      // This is not directly verifiable here without an ID token from the client.
      // We are trusting the client sends its own UID as targetUserId.
      // For the Admin Dashboard flow, adminRequesterId MUST be present.
      // This log indicates the call might not be from an admin page.
      console.log(`API Route /api/user-images (Req ID: ${reqId}): AUTH - User ${targetUserId} fetching their own images (adminRequesterId is null/undefined).`);
      // No specific 403 here; let it proceed to MongoDB. If targetUserId is not self, and there's no admin override, it's just fetching for that UID.
    } else {
      // Fallback for unusual cases, e.g., targetUserId is present but adminRequesterId is also missing.
      // Or if adminRequesterId === targetUserId (admin viewing own, should have passed above if 'admin' role, or this path if not admin)
       console.warn(`API Route /api/user-images (Req ID: ${reqId}): AUTH - Ambiguous request or self-access. targetUserId: ${targetUserId}, adminRequesterId: ${adminRequesterId}.`);
       // If it's an admin viewing their own page, they shouldn't hit the "adminRequesterId && adminRequesterId !== targetUserId" block.
       // If they are a student viewing their own, this is fine.
       // If this path is hit from the Admin Student Certs page, it means adminRequesterId was missing from the client call.
       if (!targetUserId && !adminRequesterId) { // Should be caught by earlier targetUserId check
          return NextResponse.json({ message: 'User identification missing.', errorKey: 'USER_ID_MISSING_COMPLETELY' }, { status: 400 });
       }
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
    } else if (error.message) {
        responseMessage = error.message;
    }

    const errorPayload = { message: responseMessage, errorKey, detail: error.message }; // Use the detailed message from error if it's specific
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: statusCode });
  }
}
