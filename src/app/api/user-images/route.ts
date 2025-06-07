
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';
// For a real app, you'd verify Firebase ID token here:
// import { getAuth } from 'firebase-admin/auth';
// import { initializeFirebaseAdmin } from '@/lib/firebase/admin'; // You'd create this

export async function GET(request: NextRequest) {
  // --- Production Authentication (Placeholder) ---
  // In a real app, you'd get the Firebase ID token from the Authorization header,
  // verify it using Firebase Admin SDK to get the authenticated userId.
  // const authorization = request.headers.get('Authorization');
  // if (!authorization?.startsWith('Bearer ')) {
  //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  // }
  // const idToken = authorization.split('Bearer ')[1];
  // try {
  //   await initializeFirebaseAdmin(); // Ensure admin app is initialized
  //   const decodedToken = await getAuth().verifyIdToken(idToken);
  //   const userId = decodedToken.uid;
  //   // Proceed with userId...
  // } catch (error) {
  //   console.error('Error verifying auth token in /api/user-images:', error);
  //   return NextResponse.json({ message: 'Invalid or expired token' }, { status: 401 });
  // }

  // For now, we'll get userId from query parameter for simplicity in dev.
  // IMPORTANT: This is NOT secure for production.
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ message: 'userId query parameter is required.' }, { status: 400 });
  }
  // --- End Placeholder Authentication ---


  let dbConnection;
  try {
    dbConnection = await connectToDb();
    const { db } = dbConnection; // We need db to access fs.files directly

    // GridFS stores files in two collections: fs.files (metadata) and fs.chunks (data)
    // We query the fs.files collection for metadata.
    const filesCollection = db.collection('images.files'); // 'images' is the bucketName
    
    const userImages = await filesCollection.find(
      { 'metadata.userId': userId }, // Query by userId stored in metadata
      { 
        projection: { // Only return necessary fields
          _id: 1, 
          filename: 1, 
          uploadDate: 1, 
          contentType: 1, 
          metadata: 1 // Include all metadata for potential future use (like originalName)
        } 
      }
    ).sort({ uploadDate: -1 }).toArray(); // Sort by newest first

    // Map _id to fileId for consistency if needed client-side, or just use _id
    const formattedImages = userImages.map(img => ({
      fileId: img._id.toString(),
      filename: img.filename,
      uploadDate: img.uploadDate,
      contentType: img.contentType,
      originalName: img.metadata?.originalName || img.filename, // Fallback to filename
      dataAiHint: img.metadata?.dataAiHint || '' // Example if you store hints
    }));

    return NextResponse.json(formattedImages, { status: 200 });

  } catch (error: any) {
    console.error('Error fetching user images from GridFS metadata:', error);
    let message = 'Error fetching user images.';
     if (error.message && error.message.includes('MongoDB connection error')) {
      message = 'Database connection error.';
    }
    return NextResponse.json({ message, error: error.message }, { status: 500 });
  }
  // Connection management handled by connectToDb
}
