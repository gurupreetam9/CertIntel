
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoClient, GridFSBucket, Db, MongoError } from 'mongodb';
import { Readable } from 'stream';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'imageverse_db';

let client: MongoClient | undefined;
let db: Db | undefined;
let bucket: GridFSBucket | undefined;

async function connectToDb() {
  if (!MONGODB_URI) {
    console.error('API Error: MONGODB_URI is not set in environment variables.');
    throw new Error('MONGODB_URI is not set in environment variables.');
  }
  if (db && client && client.topology && client.topology.isConnected()) {
    console.log('MongoDB: Already connected.');
    return; 
  }
  try {
    console.log('MongoDB: Attempting to connect...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    bucket = new GridFSBucket(db, { bucketName: 'images' });
    console.log('MongoDB: Connected to MongoDB and GridFS bucket initialized.');
  } catch (error: any) {
    console.error('MongoDB: Connection failed.', error);
    // Clean up client if connection failed partially
    if (client) {
        await client.close().catch(closeErr => console.error('MongoDB: Error closing client after connection failure:', closeErr));
        client = undefined;
        db = undefined;
        bucket = undefined;
    }
    throw new Error(`MongoDB connection error: ${error.message}`);
  }
}

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
  console.log(`Data URI parsed: contentType=${contentType}, extension=${filenameExtension}, bufferLength=${buffer.length}`);
  return { buffer, contentType, filenameExtension };
}


export async function POST(request: NextRequest) {
  try {
    await connectToDb();
    if (!bucket || !db) {
      console.error('API Error: Database or GridFS bucket not initialized. connectToDb might have failed silently or not been called.');
      return NextResponse.json({ message: 'Server error: Database not initialized. Please check server logs.' }, { status: 500 });
    }

    const { photoDataUri, originalName, userId, contentType: explicitContentType } = await request.json();

    if (!photoDataUri || !originalName || !userId) {
      console.warn('API Warning: Missing required fields in request body.', { photoDataUri: !!photoDataUri, originalName: !!originalName, userId: !!userId });
      return NextResponse.json({ message: 'Missing required fields: photoDataUri, originalName, or userId.' }, { status: 400 });
    }

    let buffer: Buffer;
    let detectedContentType: string | null;
    try {
      const parsedData = dataURIToBuffer(photoDataUri);
      buffer = parsedData.buffer;
      detectedContentType = parsedData.contentType;
    } catch (parseError: any) {
      console.error('API Error: Failed to parse Data URI.', parseError);
      return NextResponse.json({ message: `Invalid image data format: ${parseError.message}`, error: parseError.message }, { status: 400 });
    }
    
    const finalContentType = explicitContentType || detectedContentType || 'application/octet-stream';
    const filename = `${userId}_${Date.now()}_${originalName.replace(/\s+/g, '_')}`; // Sanitize filename
    
    console.log(`GridFS: Attempting to upload ${filename} with contentType ${finalContentType}`);

    return new Promise((resolve, reject) => {
      const uploadStream = bucket!.openUploadStream(filename, { // bucket is checked above
        contentType: finalContentType,
        metadata: {
          originalName,
          userId,
          uploadedAt: new Date(),
          sourceContentType: detectedContentType,
          explicitContentType,
        },
      });

      const readable = Readable.from(buffer);
      readable.pipe(uploadStream)
        .on('error', (error: MongoError) => { // Specific type for MongoDB errors
          console.error('GridFS: Upload stream error:', error);
          // Ensure a NextResponse is used with reject
          reject(NextResponse.json({ message: 'Failed to upload image to GridFS.', error: error.message, code: error.code }, { status: 500 }));
        })
        .on('finish', () => {
          console.log(`GridFS: File ${filename} uploaded successfully with id ${uploadStream.id}`);
          resolve(NextResponse.json({ message: 'Image uploaded successfully to MongoDB GridFS.', fileId: uploadStream.id.toString() }, { status: 201 }));
        });
    });

  } catch (error: any) {
    console.error('API Error: Unhandled error in POST /api/upload-image.', error);
    let errorMessage = 'An unexpected error occurred during image upload.';
    let statusCode = 500;

    if (error.message.includes('MONGODB_URI is not set') || error.message.includes('MongoDB connection error')) {
        errorMessage = `Server configuration error: ${error.message}`;
    } else if (error.message.includes('Invalid Data URI')) {
        errorMessage = `Bad request: ${error.message}`;
        statusCode = 400;
    }
    
    // Ensure we always try to return a JSON response
    return NextResponse.json({ message: errorMessage, error: error.message, details: error.stack }, { status: statusCode });
  }
}

// Optional: Add config to increase body size limit if you expect large data URIs
// export const config = {
//   api: {
//     bodyParser: {
//       sizeLimit: '10mb', // example: 10MB, adjust as needed
//     },
//   },
// };
