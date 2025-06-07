
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { connectToDb } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/user-images (Req ID: ${reqId}): GET request received.`);

  const userId = request.nextUrl.searchParams.get('userId');
  console.log(`API Route /api/user-images (Req ID: ${reqId}): Using userId from query param: ${userId}`);

  if (!userId) {
    console.warn(`API Route /api/user-images (Req ID: ${reqId}): userId query parameter is required.`);
    return NextResponse.json({ message: 'userId query parameter is required.', errorKey: 'MISSING_USER_ID' }, { status: 400 });
  }

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
          length: 1,
          metadata: 1
        }
      }
    ).sort({ uploadDate: -1 }).toArray();

    console.log(`API Route /api/user-images (Req ID: ${reqId}): Found ${userImages.length} images for userId ${userId}. Raw data sample:`, userImages.slice(0,1));

    const formattedImages = userImages.map(img => ({
      fileId: img._id.toString(),
      filename: img.filename,
      uploadDate: img.uploadDate as string, // Assuming uploadDate is stored as ISODate
      contentType: img.contentType,
      originalName: img.metadata?.originalName || img.filename,
      dataAiHint: img.metadata?.dataAiHint || '',
      size: img.length || 0,
      userId: img.metadata?.userId,
    }));

    console.log(`API Route /api/user-images (Req ID: ${reqId}): Returning ${formattedImages.length} formatted images. Sample:`, formattedImages.slice(0,1));
    return NextResponse.json(formattedImages, { status: 200 });

  } catch (error: any) {
    console.error(`API Route /api/user-images (Req ID: ${reqId}): Error during image fetching process. Name: ${error.name}, Message: ${error.message}`);
    if (error.stack) {
        console.error(`API Route /api/user-images (Req ID: ${reqId}): Error stack: ${error.stack.substring(0,500)}...`);
    }

    let responseMessage = 'Error fetching user images.';
    let errorKey = 'FETCH_IMAGES_FAILED';

    // This condition is key: it checks if the error came from connectToDb
    if (error.message && error.message.toLowerCase().includes('mongodb connection error')) {
      responseMessage = 'Database connection error.'; // This specific message is expected by the frontend
      errorKey = 'DB_CONNECTION_ERROR';
    } else if (error.message) {
        responseMessage = error.message;
    }

    const errorPayload = { message: responseMessage, errorKey, detail: error.message };
    console.log(`API Route /api/user-images (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status: 500 });
  }
}
