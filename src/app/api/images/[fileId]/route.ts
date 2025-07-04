
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ObjectId, MongoError } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import { getAdminAuth } from '@/lib/firebase/adminConfig';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): GET request received for fileId: ${fileId}`);

  if (!fileId || !ObjectId.isValid(fileId)) {
    console.warn(`API Route /api/images/[fileId] (Req ID: ${reqId}): Invalid or missing fileId: ${fileId}`);
    return NextResponse.json({ message: 'Invalid or missing fileId.' }, { status: 400 });
  }

  let dbConnection;
  try {
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Attempting to connect to DB for fileId: ${fileId}`);
    dbConnection = await connectToDb();
    const { bucket } = dbConnection;
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): DB connected, GridFS bucket obtained for fileId: ${fileId}`);

    const objectId = new ObjectId(fileId);

    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Searching for file with _id: ${objectId} in bucket "${bucket.bucketName}"`);
    const fileInfoArray = await bucket.find({ _id: objectId }).limit(1).toArray();

    if (fileInfoArray.length === 0) {
      console.warn(`API Route /api/images/[fileId] (Req ID: ${reqId}): Image not found for _id: ${objectId}`);
      return NextResponse.json({ message: 'Image not found.' }, { status: 404 });
    }
    const fileInfo = fileInfoArray[0];
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): File found:`, { filename: fileInfo.filename, contentType: fileInfo.contentType, length: fileInfo.length, uploadDate: fileInfo.uploadDate, metadata: fileInfo.metadata });

    const downloadStream = bucket.openDownloadStream(objectId);
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Opened download stream for fileId: ${objectId}`);

    const contentType = fileInfo.contentType || 'application/octet-stream';
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Using contentType: ${contentType}`);

    const webReadableStream = new ReadableStream({
      start(controller) {
        console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Stream started for fileId: ${objectId}`);
        downloadStream.on('data', (chunk) => {
          // console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Stream data chunk received (length: ${chunk.length}) for fileId: ${objectId}`);
          controller.enqueue(chunk);
        });
        downloadStream.on('end', () => {
          console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Stream ended for fileId: ${objectId}`);
          controller.close();
        });
        downloadStream.on('error', (err: MongoError) => {
          console.error(`API Route /api/images/[fileId] (Req ID: ${reqId}): GridFS stream error for fileId ${objectId}:`, { message: err.message, name: err.name, code: err.code });
          controller.error(err);
        });
      },
      cancel() {
        console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Stream cancelled for fileId: ${objectId}`);
        downloadStream.destroy();
      },
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Content-Length', fileInfo.length.toString());
    responseHeaders.set('Cache-Control', 'public, max-age=604800, immutable'); // Cache for 1 week

    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Returning response with stream for fileId: ${objectId}`);
    return new NextResponse(webReadableStream, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error(`API Route /api/images/[fileId] (Req ID: ${reqId}): Error serving image for fileId ${fileId}:`, {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0,300)
    });
    let status = 500;
    let message = 'Error serving image.';
    if (error.message && error.message.includes('MongoDB connection error')) {
      message = 'Database connection error.';
    } else if (error.name === 'MongoGridFSFileNotFoundError' || (error.message && error.message.includes('File not found'))) {
        status = 404;
        message = 'Image not found.';
    }
    const errorPayload = { message, error: error.message };
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Preparing to send error response:`, errorPayload);
    return NextResponse.json(errorPayload, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): DELETE request received for fileId: ${fileId}`);

  // In a real app, you'd get userId from a verified Firebase ID token in the Authorization header.
  // For now, we'll expect it as a query parameter for simplicity in this prototype.
  const userIdFromRequest = request.nextUrl.searchParams.get('userId');

  if (!userIdFromRequest) {
    console.warn(`API Route /api/images/[fileId] (Req ID: ${reqId}): Missing userId query parameter for DELETE.`);
    return NextResponse.json({ message: 'Unauthorized: Missing user identification.' }, { status: 401 });
  }

  if (!fileId || !ObjectId.isValid(fileId)) {
    console.warn(`API Route /api/images/[fileId] (Req ID: ${reqId}): Invalid fileId for DELETE: ${fileId}`);
    return NextResponse.json({ message: 'Invalid fileId.' }, { status: 400 });
  }

  let dbConnection;
  try {
    dbConnection = await connectToDb();
    const { db, bucket } = dbConnection;
    const objectId = new ObjectId(fileId);

    // Find the file to check its metadata for ownership
    const filesCollection = db.collection('images.files');
    const fileMetadata = await filesCollection.findOne({ _id: objectId });

    if (!fileMetadata) {
      console.warn(`API Route /api/images/[fileId] (Req ID: ${reqId}): File not found for DELETE: ${fileId}`);
      return NextResponse.json({ message: 'File not found.' }, { status: 404 });
    }

    // Authorization check: Ensure the user deleting owns the file
    if (fileMetadata.metadata?.userId !== userIdFromRequest) {
      console.warn(`API Route /api/images/[fileId] (Req ID: ${reqId}): Unauthorized DELETE attempt. User ${userIdFromRequest} tried to delete file ${fileId} owned by ${fileMetadata.metadata?.userId}.`);
      return NextResponse.json({ message: 'Unauthorized: You do not have permission to delete this file.' }, { status: 403 });
    }

    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Authorized. Attempting to delete file ${fileId} from GridFS.`);
    await bucket.delete(objectId);
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): File ${fileId} deleted successfully.`);

    return NextResponse.json({ message: 'File deleted successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API Route /api/images/[fileId] (Req ID: ${reqId}): Error deleting image for fileId ${fileId}:`, {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 300),
    });
    let status = 500;
    let message = 'Error deleting image.';
    if (error.message && error.message.includes('MongoDB connection error')) {
      message = 'Database connection error.';
    }
    const errorPayload = { message, error: error.message };
    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): Preparing to send error response for DELETE:`, errorPayload);
    return NextResponse.json(errorPayload, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): PATCH request received for fileId: ${fileId}`);

  // Authentication
  const authorizationHeader = request.headers.get('Authorization');
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.' }, { status: 401 });
  }
  const idToken = authorizationHeader.split('Bearer ')[1];
  
  let decodedToken;
  try {
      const adminAuth = getAdminAuth();
      decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch (error: any) {
      console.error(`API Route /api/images/[fileId] PATCH (Req ID: ${reqId}): AUTH FAIL - ID Token verification failed:`, { message: error.message, code: error.code });
      return NextResponse.json({ message: `Unauthorized: Invalid ID token.`, errorKey: 'INVALID_ID_TOKEN' }, { status: 401 });
  }

  const userId = decodedToken.uid;

  // Body parsing
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ message: 'Invalid request body. Expected JSON.' }, { status: 400 });
  }
  
  const { newName } = body;
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return NextResponse.json({ message: 'Invalid or missing newName in request body.' }, { status: 400 });
  }

  // fileId validation
  if (!fileId || !ObjectId.isValid(fileId)) {
    return NextResponse.json({ message: 'Invalid fileId.' }, { status: 400 });
  }

  try {
    const { db } = await connectToDb();
    const objectId = new ObjectId(fileId);
    const filesCollection = db.collection('images.files');
    
    // Authorization check
    const fileMetadata = await filesCollection.findOne({ _id: objectId });
    if (!fileMetadata) {
      return NextResponse.json({ message: 'File not found.' }, { status: 404 });
    }
    if (fileMetadata.metadata?.userId !== userId) {
      return NextResponse.json({ message: 'Unauthorized: You do not have permission to edit this file.' }, { status: 403 });
    }

    // Perform update
    const updateResult = await filesCollection.updateOne(
      { _id: objectId },
      { $set: { 'metadata.originalName': newName.trim(), filename: newName.trim(), 'metadata.updatedAt': new Date().toISOString() } }
    );
    
    if (updateResult.modifiedCount === 0) {
        if (updateResult.matchedCount === 1) {
            return NextResponse.json({ message: 'File name is already up to date.' }, { status: 200 });
        }
        throw new Error('Failed to update the document in the database.');
    }

    console.log(`API Route /api/images/[fileId] (Req ID: ${reqId}): File ${fileId} updated successfully.`);
    return NextResponse.json({ message: 'File name updated successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API Route /api/images/[fileId] (Req ID: ${reqId}): Error updating image for fileId ${fileId}:`, {
      message: error.message,
      stack: error.stack?.substring(0, 300),
    });
    return NextResponse.json({ message: error.message || 'Error updating image.' }, { status: 500 });
  }
}
