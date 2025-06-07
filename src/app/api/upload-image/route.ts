
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoClient, GridFSBucket, Db } from 'mongodb';
import { Readable } from 'stream';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'imageverse_db'; // You can set a default or make it an env var

let client: MongoClient;
let db: Db;
let bucket: GridFSBucket;

async function connectToDb() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables.');
  }
  if (db && client && client.topology && client.topology.isConnected()) {
    return; // Already connected
  }
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  bucket = new GridFSBucket(db, { bucketName: 'images' });
  console.log('Connected to MongoDB and GridFS bucket initialized.');
}

// Helper to convert Data URI to Buffer
function dataURIToBuffer(dataURI: string): { buffer: Buffer; contentType: string | null; filenameExtension: string | null } {
  if (!dataURI.startsWith('data:')) {
    throw new Error('Invalid Data URI');
  }
  const MimeRegex = /^data:(.+?);base64,(.+)$/;
  const match = dataURI.match(MimeRegex);
  if (!match) {
    throw new Error('Invalid Data URI format');
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
  try {
    await connectToDb();
    const { photoDataUri, originalName, userId, contentType: explicitContentType } = await request.json();

    if (!photoDataUri || !originalName || !userId) {
      return NextResponse.json({ message: 'Missing required fields: photoDataUri, originalName, or userId.' }, { status: 400 });
    }

    const { buffer, contentType: detectedContentType, filenameExtension } = dataURIToBuffer(photoDataUri);
    const finalContentType = explicitContentType || detectedContentType || 'application/octet-stream';
    
    // Construct a unique filename, e.g., using userId and timestamp
    const filename = `${userId}_${Date.now()}_${originalName}`;

    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: finalContentType,
        metadata: {
          originalName,
          userId,
          uploadedAt: new Date(),
          sourceContentType: detectedContentType, // Store detected type from data URI for reference
          explicitContentType, // Store explicitly passed type if any
        },
      });

      const readable = Readable.from(buffer);
      readable.pipe(uploadStream)
        .on('error', (error) => {
          console.error('GridFS upload stream error:', error);
          reject(NextResponse.json({ message: 'Failed to upload image to GridFS.', error: error.message }, { status: 500 }));
        })
        .on('finish', () => {
          console.log(`GridFS: File ${filename} uploaded successfully with id ${uploadStream.id}`);
          resolve(NextResponse.json({ message: 'Image uploaded successfully to MongoDB GridFS.', fileId: uploadStream.id.toString() }, { status: 201 }));
        });
    });

  } catch (error: any) {
    console.error('Error processing image upload to MongoDB:', error);
    // Ensure a response is always sent
    if (error.message.includes('Invalid Data URI')) {
        return NextResponse.json({ message: 'Invalid image data format.', error: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: 'Error processing image upload.', error: error.message }, { status: 500 });
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

    