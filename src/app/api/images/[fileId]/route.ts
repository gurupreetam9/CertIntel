
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ObjectId, MongoError } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;

  if (!fileId || !ObjectId.isValid(fileId)) {
    return NextResponse.json({ message: 'Invalid or missing fileId.' }, { status: 400 });
  }

  let dbConnection;
  try {
    dbConnection = await connectToDb();
    const { bucket } = dbConnection;
    
    const objectId = new ObjectId(fileId);

    // Check if file exists first to provide a better error message
    const fileInfo = await bucket.find({ _id: objectId }).limit(1).toArray();
    if (fileInfo.length === 0) {
      return NextResponse.json({ message: 'Image not found.' }, { status: 404 });
    }
    
    const downloadStream = bucket.openDownloadStream(objectId);

    // Get content type from metadata, default if not found
    const contentType = fileInfo[0].contentType || 'application/octet-stream';

    // Use ReadableStream from Web API for NextResponse
    const webReadableStream = new ReadableStream({
      start(controller) {
        downloadStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        downloadStream.on('end', () => {
          controller.close();
        });
        downloadStream.on('error', (err: MongoError) => {
          console.error('GridFS stream error in /api/images/[fileId]:', err);
          controller.error(err);
        });
      },
      cancel() {
        downloadStream.destroy();
      },
    });
    
    const response = new NextResponse(webReadableStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Consider adding Cache-Control headers for production
        // 'Cache-Control': 'public, max-age=31536000, immutable', 
      },
    });
    return response;

  } catch (error: any) {
    console.error('Error serving image from GridFS:', error);
    let status = 500;
    let message = 'Error serving image.';
    if (error.message && error.message.includes('MongoDB connection error')) {
      message = 'Database connection error.';
    } else if (error.name === 'MongoGridFSFileNotFoundError' || (error.message && error.message.includes('File not found'))) {
        status = 404;
        message = 'Image not found.';
    }
    return NextResponse.json({ message, error: error.message }, { status });
  }
  // Connection management handled by connectToDb
}
