
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError } from 'mongodb';
import { Readable } from 'stream';
import { connectToDb } from '@/lib/mongodb'; // Import the centralized connection utility

// Helper to convert Data URI to Buffer
function dataURIToBuffer(dataURI: string): { buffer: Buffer; contentType: string | null; filenameExtension: string | null } {
  if (!dataURI.startsWith('data:')) {
    console.error('Data URI Error: Invalid Data URI prefix.');
    throw new Error('Invalid Data URI: Missing "data:" prefix.');
  }
  const MimeRegex = /^data:(.+?);base64,(.+)$/;
  const match = dataURI.match(MimeRegex);
  if (!match) {
    console.error('Data URI Error: Invalid Data URI format. Does not match regex.');
    throw new Error('Invalid Data URI format. Expected "data:<mimetype>;base64,<data>".');
  }
  
  const contentType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  let filenameExtension = null;
  if (contentType) {
    const parts = contentType.split('/');
    if (parts.length === 2) {
        filenameExtension = parts[1];
    }
  }
  return { buffer, contentType, filenameExtension };
}


export async function POST(request: NextRequest) {
  console.log('API Route /api/upload-image: POST request received.');
  
  let dbConnection;
  try {
    dbConnection = await connectToDb();
    if (!dbConnection || !dbConnection.bucket || !dbConnection.db) { 
      const errorMsg = 'Server error: Database or GridFS bucket not initialized after connectToDb call.';
      console.error(`API Error (upload-image): ${errorMsg}`);
      const errorPayload = { message: errorMsg, error: 'DB_INITIALIZATION_FAILURE' };
      console.log('API Error (upload-image - DB Init): Preparing to send error response:', errorPayload);
      return NextResponse.json(errorPayload, { status: 500 });
    }
    const { bucket } = dbConnection;

    const requestBody = await request.json();
    const { photoDataUri, originalName, userId, contentType: explicitContentType } = requestBody;

    if (!photoDataUri || !originalName || !userId) {
      const errorMsg = 'Missing required fields: photoDataUri, originalName, or userId.';
      console.warn(`API Warning (upload-image): ${errorMsg}`, { photoDataUri: !!photoDataUri, originalName: !!originalName, userId: !!userId });
      const errorPayload = { message: errorMsg, error: 'MISSING_FIELDS' };
      console.log('API Warning (upload-image - Missing Fields): Preparing to send error response:', errorPayload);
      return NextResponse.json(errorPayload, { status: 400 });
    }

    let buffer: Buffer;
    let detectedContentType: string | null;
    try {
      const parsedData = dataURIToBuffer(photoDataUri);
      buffer = parsedData.buffer;
      detectedContentType = parsedData.contentType;
    } catch (parseError: any) {
      const errorMsg = `Invalid image data format: ${parseError.message}`;
      console.error('API Error (upload-image): Failed to parse Data URI.', { message: parseError.message });
      const errorPayload = { message: errorMsg, error: 'DATA_URI_PARSE_ERROR', details: String(parseError.message) };
      console.log('API Error (upload-image - Data URI Parse): Preparing to send error response:', errorPayload);
      return NextResponse.json(errorPayload, { status: 400 });
    }
    
    const finalContentType = explicitContentType || detectedContentType || 'application/octet-stream';
    const filename = `${userId}_${Date.now()}_${originalName.replace(/\s+/g, '_')}`; 
    
    console.log(`GridFS (upload-image): Attempting to upload "${filename}" with contentType "${finalContentType}"`);

    return new Promise((resolve) => {
      const uploadStream = bucket.openUploadStream(filename, { 
        contentType: finalContentType,
        metadata: { // Ensure metadata is stored correctly
          originalName,
          userId,
          uploadedAt: new Date().toISOString(),
          sourceContentType: detectedContentType, // Store original detected type
          explicitContentType, // And the type client sent
        },
      });

      const readable = Readable.from(buffer);
      readable.pipe(uploadStream)
        .on('error', (error: MongoError) => { 
          const errorMsg = 'Failed to upload image to GridFS.';
          console.error(`GridFS Stream Error (upload-image) for ${filename}:`, { message: error.message, code: error.code, mongoErrorName: error.name });
          const errorPayload = { 
            message: errorMsg, 
            error: 'GRIDFS_UPLOAD_STREAM_ERROR', 
            details: String(error.message || 'Unknown GridFS stream error'),
            mongoErrorCode: String(error.code || 'N/A')
          };
          console.log('API Error (upload-image - GridFS Stream): Preparing to send error response:', errorPayload);
          resolve(NextResponse.json(errorPayload, { status: 500 }));
        })
        .on('finish', () => {
          console.log(`GridFS (upload-image): File "${filename}" (ID: ${uploadStream.id}) uploaded successfully.`);
          resolve(NextResponse.json({ 
            message: 'Image uploaded successfully to MongoDB GridFS.', 
            fileId: uploadStream.id.toString(), // Send back the fileId
            filename: filename
          }, { status: 201 }));
        });
    });

  } catch (error: any) {
    const generalErrorMsg = 'An unexpected error occurred during image upload processing.';
    console.error('API Error (upload-image - Outer Catch): Unhandled error in POST /api/upload-image.', { 
        errorMessage: error.message, 
        errorType: error.constructor?.name, 
        errorStack: error.stack 
    });
    
    let displayMessage = generalErrorMsg;
    if (error.message && typeof error.message === 'string') {
        if (error.message.includes('MONGODB_URI is not set')) {
            displayMessage = `Server configuration error: ${error.message}`;
        } else if (error.message.includes('MongoDB connection error')) {
            displayMessage = `Database connection issue: ${error.message}`; 
        } else if (error.message.includes('Invalid Data URI')) {
            displayMessage = `Bad request: ${error.message}`;
        } else {
            displayMessage = error.message; 
        }
    }

    const errorPayload = { 
        message: displayMessage, 
        error: 'UNHANDLED_SERVER_ERROR',
        details: String(error.message || 'No specific error message available')
    };
    console.log('API Error (upload-image - Outer Catch): Preparing to send error response:', errorPayload);
    return NextResponse.json(errorPayload, { status: 500 });
  }
  // Note: The MongoDB client connection is managed by connectToDb and might be kept open for reuse.
  // Explicitly closing it here might be premature if connection pooling is desired.
  // If you need to ensure it's closed after every request (not typical for serverless functions),
  // you'd add: finally { if (dbConnection?.client) await dbConnection.client.close(); }
}
