
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoClient, GridFSBucket, Db, MongoError, ServerApiVersion } from 'mongodb';
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

  if (db && client && client.db(DB_NAME)) {
    try {
      await client.db(DB_NAME).command({ ping: 1 });
      console.log('MongoDB: Already connected and responsive.');
      return;
    } catch (pingError: any) {
      console.warn('MongoDB: Existing client lost connection or unresponsive, will attempt to reconnect.', { message: pingError.message, stack: pingError.stack });
      if (client) {
        try {
          await client.close();
          console.log('MongoDB: Closed unresponsive client.');
        } catch (closeErr: any) {
          console.error('MongoDB: Error closing unresponsive client:', { message: closeErr.message, stack: closeErr.stack });
        }
      }
      client = undefined;
      db = undefined;
      bucket = undefined;
    }
  }

  try {
    console.log('MongoDB: Attempting to connect with new client...');
    client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await client.connect();
    db = client.db(DB_NAME);
    bucket = new GridFSBucket(db, { bucketName: 'images' });
    console.log('MongoDB: Successfully connected to MongoDB and GridFS bucket initialized.');
  } catch (error: any) {
    console.error('MongoDB: Connection failed.', { errorMessage: error.message, errorType: error.constructor.name, stack: error.stack, fullError: error });
    if (client) {
      try {
        await client.close();
        console.log('MongoDB: Closed client after connection failure.');
      } catch (closeErr: any) {
        console.error('MongoDB: Error closing client after connection failure:', { message: closeErr.message, stack: closeErr.stack });
      }
      client = undefined;
      db = undefined;
      bucket = undefined;
    }
    throw new Error(`MongoDB connection error: ${error.message || 'Failed to connect to database.'}`);
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
  console.log('API Route /api/upload-image: POST request received.');
  try {
    await connectToDb(); 
    if (!bucket || !db) { 
      console.error('API Error: Database or GridFS bucket not initialized. connectToDb might have failed.');
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
      console.error('API Error: Failed to parse Data URI.', { message: parseError.message, stack: parseError.stack });
      return NextResponse.json({ message: `Invalid image data format: ${parseError.message}`, error: parseError.message, details: parseError.stack }, { status: 400 });
    }
    
    const finalContentType = explicitContentType || detectedContentType || 'application/octet-stream';
    const filename = `${userId}_${Date.now()}_${originalName.replace(/\s+/g, '_')}`; 
    
    console.log(`GridFS: Attempting to upload ${filename} with contentType ${finalContentType}`);

    return new Promise((resolve, reject) => {
      const uploadStream = bucket!.openUploadStream(filename, { 
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
        .on('error', (error: MongoError) => { 
          console.error('GridFS: Upload stream error:', { message: error.message, code: error.code, stack: error.stack, fullError: error });
          resolve(NextResponse.json({ message: 'Failed to upload image to GridFS.', error: error.message, code: error.code, details: error.stack }, { status: 500 }));
        })
        .on('finish', () => {
          console.log(`GridFS: File ${filename} uploaded successfully with id ${uploadStream.id}`);
          resolve(NextResponse.json({ message: 'Image uploaded successfully to MongoDB GridFS.', fileId: uploadStream.id.toString() }, { status: 201 }));
        });
    });

  } catch (error: any) {
    console.error('API Error: Unhandled error in POST /api/upload-image.', { message: error.message, type: error.constructor.name, stack: error.stack });
    let errorMessage = 'An unexpected error occurred during image upload.';
    let statusCode = 500;

    if (error.message && error.message.includes('MONGODB_URI is not set')) {
        errorMessage = `Server configuration error: ${error.message}`;
    } else if (error.message && error.message.includes('MongoDB connection error')) {
        errorMessage = `Server configuration error: ${error.message}`; 
    } else if (error.message && error.message.includes('Invalid Data URI')) {
        errorMessage = `Bad request: ${error.message}`;
        statusCode = 400;
    } else if (error.message) { 
        errorMessage = error.message;
    }
    
    return NextResponse.json({ message: errorMessage, error: error.message, details: error.stack }, { status: statusCode });
  }
}
