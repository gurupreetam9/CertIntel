
import { MongoClient, Db, GridFSBucket, ServerApiVersion } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'imageverse_db'; 

if (!MONGODB_URI) {
  const errorMsg = 'CRITICAL: MONGODB_URI is not set in environment variables. The application cannot connect to the database.';
  console.error("MongoDB Lib Error:", errorMsg);
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
  const connectionId = Math.random().toString(36).substring(2, 7); // For tracking specific connection attempts
  console.log(`MongoDB (connectToDb-${connectionId}): Attempting connection...`);

  if (client && dbInstance && bucketInstance) {
    try {
      await client.db(DB_NAME).command({ ping: 1 });
      console.log(`MongoDB (connectToDb-${connectionId}): Re-using existing active connection for DB: ${DB_NAME}.`);
      return { client, db: dbInstance, bucket: bucketInstance };
    } catch (pingError: any) {
      console.warn(`MongoDB (connectToDb-${connectionId}): Existing client lost connection or unresponsive, will attempt to reconnect. Ping Error:`, { message: pingError.message, code: pingError.code, errorName: pingError.name });
      if (client) {
        try {
          await client.close();
          console.log(`MongoDB (connectToDb-${connectionId}): Closed unresponsive client.`);
        } catch (closeErr: any) {
          console.error(`MongoDB (connectToDb-${connectionId}): Error closing unresponsive client:`, { message: closeErr.message });
        }
      }
      client = undefined;
      dbInstance = undefined;
      bucketInstance = undefined;
      console.log(`MongoDB (connectToDb-${connectionId}): Cleared existing client instances for reconnection.`);
    }
  }

  try {
    console.log(`MongoDB (connectToDb-${connectionId}): Creating new MongoClient instance for URI: ${MONGODB_URI ? MONGODB_URI.substring(0, MONGODB_URI.indexOf('@')) + '@...' : 'NOT_SET'}`); // Avoid logging full URI with creds
    const newClient = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000, // 45 seconds
    });
    
    console.log(`MongoDB (connectToDb-${connectionId}): Connecting to new client...`);
    await newClient.connect();
    console.log(`MongoDB (connectToDb-${connectionId}): New client connected.`);
    
    const newDbInstance = newClient.db(DB_NAME);
    console.log(`MongoDB (connectToDb-${connectionId}): Got DB instance for "${DB_NAME}".`);
    
    const newBucketInstance = new GridFSBucket(newDbInstance, { bucketName: 'images' });
    console.log(`MongoDB (connectToDb-${connectionId}): Initialized GridFS bucket "images".`);
    
    client = newClient;
    dbInstance = newDbInstance;
    bucketInstance = newBucketInstance;
    
    console.log(`MongoDB (connectToDb-${connectionId}): Successfully connected to database "${DB_NAME}" and GridFS bucket "images" initialized.`);
    return { client, db: dbInstance, bucket: bucketInstance };
  } catch (error: any) {
    console.error(`MongoDB (connectToDb-${connectionId}): Connection failed.`, { 
        errorMessage: error.message, 
        errorCode: error.code,
        errorName: error.name,
        errorLabels: error.errorLabels,
        isTransient: error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError'),
        isNetworkError: error.hasErrorLabel && error.hasErrorLabel('NetworkError'),
    });
    if (client) { 
      try {
        await client.close();
        console.log(`MongoDB (connectToDb-${connectionId}): Closed client after connection failure.`);
      } catch (closeErr: any) {
        console.error(`MongoDB (connectToDb-${connectionId}): Error closing client after connection failure:`, { message: closeErr.message });
      }
    }
    client = undefined;
    dbInstance = undefined;
    bucketInstance = undefined;
    throw new Error(`MongoDB connection error: ${error.message || 'Failed to connect to database.'}`);
  }
}
