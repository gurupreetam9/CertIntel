
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';
// For a real app, you'd verify Firebase ID token here:
// import { getAuth } from 'firebase-admin/auth';
// import { initializeFirebaseAdmin } from '@/lib/firebase/admin'; // You'd create this

export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/user-images (Req ID: ${reqId}): GET request received.`);

  // --- Production Authentication (Placeholder) ---
  // const authorization = request.headers.get('Authorization');
  // if (!authorization?.startsWith('Bearer ')) {
  //   console.warn(`API Route /api/user-images (Req ID: ${reqId}): Unauthorized - Missing or invalid Bearer token.`);
  //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  // }
  // const idToken = authorization.split('Bearer ')[1];
  // try {
  //   await initializeFirebaseAdmin(); 
  //   const decodedToken = await getAuth().verifyIdToken(idToken);
  //   const userId = decodedToken.uid;
  //   console.log(`API Route /api/user-images (Req ID: ${reqId}): Authenticated userId (from token): ${userId}`);
  // } catch (error) {
  //   console.error(`API Route /api/user-images (Req ID: ${reqId}): Error verifying auth token:`, error);
  //   return NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
  // }

  const userId = request.nextUrl.searchParams.get('userId');
  console.log(`API Route /api/user-images (Req ID: ${reqId}): Using userId from query param: ${userId}`);

  if (!userId) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): userId query parameter is required.`);
    return NextResponse.json({ message: 'userId query parameter is required.' }, { status: 400 });
  }
  // --- End Placeholder Authentication ---


  let dbConnection;
  try {
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Attempting to connect to DB...`);
    dbConnection = await connectToDb();
    const { db } = dbConnection; 
    console.log(`API Route /api/user-images (Req ID: ${reqId}): DB connected. Accessing 'images.files' collection.`);

    const filesCollection = db.collection('images.files'); 
    
    const query = { 'metadata.userId': userId };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Querying 'images.files' with:`, query);

    const userImages = await filesCollection.find(
      query, 
      { 
        projection: { 
          _id: 1, 
          filename: 1, 
          uploadDate: 1, 
          contentType: 1, 
          length: 1, // File size in bytes
          metadata: 1 
        } 
      }
    ).sort({ uploadDate: -1 }).toArray(); 
    
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Found ${userImages.length} images for userId ${userId}. Raw data:`, JSON.stringify(userImages.slice(0,2))); // Log first 2 results

    const formattedImages = userImages.map(img => ({
      fileId: img._id.toString(),
      filename: img.filename,
      uploadDate: img.uploadDate,
      contentType: img.contentType,
      originalName: img.metadata?.originalName || img.filename, 
      dataAiHint: img.metadata?.dataAiHint || '',
      size: img.length || 0,
    }));

    console.log(`API Route /api/user-images (Req ID: ${reqId}): Returning ${formattedImages.length} formatted images. Sample:`, JSON.stringify(formattedImages.slice(0,2)));
    return NextResponse.json(formattedImages, { status: 200 });

  } catch (error: any) {
    console.error(`API Route /api/user-images (Req ID: ${reqId}): Error fetching user images from GridFS metadata:`, { 
        message: error.message, 
        name: error.name, 
        stack: error.stack?.substring(0, 300) 
    });
    let message = 'Error fetching user images.';
     if (error.message && error.message.includes('MongoDB connection error')) {
      message = 'Database connection error.';
    }
    const errorPayload = { message, error: error.message };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: 500 });
  }
}
