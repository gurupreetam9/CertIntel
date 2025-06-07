
import { MongoClient, Db, GridFSBucket, ServerApiVersion } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'imageverse_db'; // Use the same default as in upload-image

if (!MONGODB_URI) {
  const errorMsg = 'CRITICAL: MONGODB_URI is not set in environment variables. The application cannot connect to the database.';
  console.error(errorMsg);
  throw new Error(errorMsg);
}

let client: MongoClient | undefined;
let dbInstance: Db | undefined;
let bucketInstance: GridFSBucket | undefined;

interface ConnectionResult {
  client: MongoClient;
  db: Db;
  bucket: GridFSBucket;
}

export async function connectToDb(): Promise<ConnectionResult> {
  if (client && dbInstance && bucketInstance) {
    try {
      await client.db(DB_NAME).command({ ping: 1 });
      // console.log('MongoDB (connectToDb): Re-using existing active connection.');
      return { client, db: dbInstance, bucket: bucketInstance };
    } catch (pingError: any) {
      console.warn('MongoDB (connectToDb): Existing client lost connection or unresponsive, will attempt to reconnect.', { message: pingError.message });
      if (client) {
        try {
          await client.close();
          console.log('MongoDB (connectToDb): Closed unresponsive client.');
        } catch (closeErr: any) {
          console.error('MongoDB (connectToDb): Error closing unresponsive client:', { message: closeErr.message });
        }
      }
      client = undefined;
      dbInstance = undefined;
      bucketInstance = undefined;
    }
  }

  try {
    // console.log('MongoDB (connectToDb): Attempting to connect with new client...');
    const newClient = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await newClient.connect();
    const newDbInstance = newClient.db(DB_NAME);
    const newBucketInstance = new GridFSBucket(newDbInstance, { bucketName: 'images' });
    
    client = newClient;
    dbInstance = newDbInstance;
    bucketInstance = newBucketInstance;
    
    // console.log(`MongoDB (connectToDb): Successfully connected to database "${DB_NAME}" and GridFS bucket "images" initialized.`);
    return { client, db: dbInstance, bucket: bucketInstance };
  } catch (error: any) {
    console.error('MongoDB (connectToDb): Connection failed.', { errorMessage: error.message, errorType: error.constructor.name });
    if (client) { // If partial connection attempt created a client
      try {
        await client.close();
        console.log('MongoDB (connectToDb): Closed client after connection failure.');
      } catch (closeErr: any) {
        console.error('MongoDB (connectToDb): Error closing client after connection failure:', { message: closeErr.message });
      }
    }
    client = undefined;
    dbInstance = undefined;
    bucketInstance = undefined;
    throw new Error(`MongoDB connection error: ${error.message || 'Failed to connect to database.'}`);
  }
}

// Optional: Function to ensure client is closed on app shutdown (more relevant for standalone scripts, Next.js manages this differently)
// export async function closeDbConnection() {
//   if (client) {
//     await client.close();
//     console.log('MongoDB (connectToDb): Connection closed.');
//     client = undefined;
//     dbInstance = undefined;
//     bucketInstance = undefined;
//   }
// }
