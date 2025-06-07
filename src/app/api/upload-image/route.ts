
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
    console.error('MongoDB Connect Error: MONGODB_URI is not set in environment variables.');
    throw new Error('MONGODB_URI is not set in environment variables.');
  }

  if (client && db && bucket) {
    try {
      // Ping the database to ensure the client is still connected and responsive
      await client.db(DB_NAME).command({ ping: 1 });
      console.log('MongoDB: Re-using existing active connection.');
      return;
    } catch (pingError: any) {
      console.warn('MongoDB: Existing client lost connection or unresponsive, will attempt to reconnect.', { message: pingError.message });
      if (client) {
        try {
          await client.close();
          console.log('MongoDB: Closed unresponsive client.');
        } catch (closeErr: any) {
          console.error('MongoDB: Error closing unresponsive client:', { message: closeErr.message });
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
      // Consider adding connection timeout options if needed
      // connectTimeoutMS: 10000, // 10 seconds
      // socketTimeoutMS: 45000, // 45 seconds
    });
    await client.connect();
    db = client.db(DB_NAME);
    bucket = new GridFSBucket(db, { bucketName: 'images' });
    console.log(`MongoDB: Successfully connected to database "${DB_NAME}" and GridFS bucket "images" initialized.`);
  } catch (error: any) {
    console.error('MongoDB: Connection failed.', { errorMessage: error.message, errorType: error.constructor.name, fullError: error });
    if (client) {
      try {
        await client.close();
        console.log('MongoDB: Closed client after connection failure.');
      } catch (closeErr: any) {
        console.error('MongoDB: Error closing client after connection failure:', { message: closeErr.message });
      }
    }
    client = undefined;
    db = undefined;
    bucket = undefined;
    // Re-throw a more generic error to be caught by the POST handler
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
  // console.log(`Data URI parsed: contentType=${contentType}, extension=${filenameExtension}, bufferLength=${buffer.length}`);
  return { buffer, contentType, filenameExtension };
}


export async function POST(request: NextRequest) {
  console.log('API Route /api/upload-image: POST request received.');
  
  if (!MONGODB_URI) {
    const errorMsg = 'Server configuration error: MONGODB_URI is not set. Please check server logs and .env.local file.';
    console.error(`API Error: ${errorMsg}`);
    const errorPayload = { message: errorMsg, error: 'Missing MONGODB_URI' };
    console.log('API Error (MONGODB_URI): Preparing to send error response:', errorPayload);
    return NextResponse.json(errorPayload, { status: 500 });
  }

  try {
    await connectToDb(); 
    if (!bucket || !db) { 
      const errorMsg = 'Server error: Database or GridFS bucket not initialized. connectToDb might have failed or MONGODB_URI is invalid.';
      console.error(`API Error: ${errorMsg}`);
      const errorPayload = { message: errorMsg, error: 'DB_INITIALIZATION_FAILURE' };
      console.log('API Error (DB Init): Preparing to send error response:', errorPayload);
      return NextResponse.json(errorPayload, { status: 500 });
    }

    const requestBody = await request.json();
    const { photoDataUri, originalName, userId, contentType: explicitContentType } = requestBody;

    if (!photoDataUri || !originalName || !userId) {
      const errorMsg = 'Missing required fields: photoDataUri, originalName, or userId.';
      console.warn(`API Warning: ${errorMsg}`, { photoDataUri: !!photoDataUri, originalName: !!originalName, userId: !!userId });
      const errorPayload = { message: errorMsg, error: 'MISSING_FIELDS' };
      console.log('API Warning (Missing Fields): Preparing to send error response:', errorPayload);
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
      console.error('API Error: Failed to parse Data URI.', { message: parseError.message });
      const errorPayload = { message: errorMsg, error: 'DATA_URI_PARSE_ERROR', details: String(parseError.message) };
      console.log('API Error (Data URI Parse): Preparing to send error response:', errorPayload);
      return NextResponse.json(errorPayload, { status: 400 });
    }
    
    const finalContentType = explicitContentType || detectedContentType || 'application/octet-stream';
    const filename = `${userId}_${Date.now()}_${originalName.replace(/\s+/g, '_')}`; 
    
    console.log(`GridFS: Attempting to upload "${filename}" with contentType "${finalContentType}"`);

    return new Promise((resolve) => {
      const uploadStream = bucket!.openUploadStream(filename, { 
        contentType: finalContentType,
        metadata: {
          originalName,
          userId,
          uploadedAt: new Date().toISOString(),
          sourceContentType: detectedContentType,
          explicitContentType,
        },
      });

      const readable = Readable.from(buffer);
      readable.pipe(uploadStream)
        .on('error', (error: MongoError) => { 
          const errorMsg = 'Failed to upload image to GridFS.';
          console.error(`GridFS Stream Error for ${filename}:`, { message: error.message, code: error.code, mongoErrorName: error.name });
          const errorPayload = { 
            message: errorMsg, 
            error: 'GRIDFS_UPLOAD_STREAM_ERROR', 
            details: String(error.message || 'Unknown GridFS stream error'),
            mongoErrorCode: String(error.code || 'N/A')
          };
          console.log('API Error (GridFS Stream): Preparing to send error response:', errorPayload);
          resolve(NextResponse.json(errorPayload, { status: 500 }));
        })
        .on('finish', () => {
          console.log(`GridFS: File "${filename}" (ID: ${uploadStream.id}) uploaded successfully.`);
          resolve(NextResponse.json({ 
            message: 'Image uploaded successfully to MongoDB GridFS.', 
            fileId: uploadStream.id.toString(),
            filename: filename
          }, { status: 201 }));
        });
    });

  } catch (error: any) {
    const generalErrorMsg = 'An unexpected error occurred during image upload processing.';
    console.error('API Error (Outer Catch): Unhandled error in POST /api/upload-image.', { 
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
            displayMessage = error.message; // Use the specific error message if available
        }
    }

    const errorPayload = { 
        message: displayMessage, 
        error: 'UNHANDLED_SERVER_ERROR',
        details: String(error.message || 'No specific error message available')
    };
    console.log('API Error (Outer Catch): Preparing to send error response:', errorPayload);
    return NextResponse.json(errorPayload, { status: 500 });
  }
}
