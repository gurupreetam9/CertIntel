
import { MongoClient, Db, GridFSBucket, ServerApiVersion } from 'mongodb';

const MONGODB_URI_ENV = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'imageverse_db';

if (!MONGODB_URI_ENV) {
  const errorMsg = 'CRITICAL: MONGODB_URI is not set in environment variables. The application cannot connect to the database. Please check your .env.local file and ensure the Next.js server is restarted after any changes.';
  console.error("MongoDB Lib Startup Error:", errorMsg);
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
  const connectionId = Math.random().toString(36).substring(2, 7);
  
  console.log(`MongoDB (connectToDb-${connectionId}): Attempting connection. Target DB: "${DB_NAME}".`);
  console.log(`MongoDB (connectToDb-${connectionId}): IMPORTANT: Please MANUALLY VERIFY your MONGODB_URI in .env.local. Ensure it is EXACTLY as provided by MongoDB Atlas, including any options like 'retryWrites=true&w=majority'. Check for typos or accidental modifications. URI being used (credentials redacted): ${MONGODB_URI_ENV.substring(0, MONGODB_URI_ENV.indexOf('://') + 3) + '<credentials_redacted>' + MONGODB_URI_ENV.substring(MONGODB_URI_ENV.indexOf('@'))}`);
  console.log(`MongoDB (connectToDb-${connectionId}): ALSO IMPORTANT: Please check your MongoDB Atlas cluster status directly in the Atlas dashboard to ensure it's healthy and there are no ongoing maintenance activities or alerts. Ensure your Atlas IP Access List includes your Workstation's current public IP or '0.0.0.0/0' (for testing).`);

  if (client && dbInstance && bucketInstance) {
    try {
      console.log(`MongoDB (connectToDb-${connectionId}): Found existing client. Pinging DB "${DB_NAME}" to check connection health...`);
      await client.db(DB_NAME).command({ ping: 1 });
      console.log(`MongoDB (connectToDb-${connectionId}): Ping to existing client for DB "${DB_NAME}" was SUCCESSFUL. Re-using existing connection.`);
      return { client, db: dbInstance, bucket: bucketInstance };
    } catch (pingError: any) {
      console.warn(`MongoDB (connectToDb-${connectionId}): Ping to existing client failed for DB "${DB_NAME}". It might be unresponsive or the connection was dropped. Will attempt to close and reconnect. Ping Error:`, { message: pingError.message, code: pingError.code, name: pingError.name });
      if (client) {
        try {
          await client.close();
          console.log(`MongoDB (connectToDb-${connectionId}): Successfully closed unresponsive client.`);
        } catch (closeErr: any) {
          console.error(`MongoDB (connectToDb-${connectionId}): Error while trying to close unresponsive client:`, { message: closeErr.message });
        }
      }
      client = undefined;
      dbInstance = undefined;
      bucketInstance = undefined;
      console.log(`MongoDB (connectToDb-${connectionId}): Cleared existing client instances. Proceeding to establish a new connection.`);
    }
  }

  try {
    console.log(`MongoDB (connectToDb-${connectionId}): No active client or existing client was unresponsive. Creating new MongoClient instance...`);
    const newClient = new MongoClient(MONGODB_URI_ENV, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 30000, 
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 30000,
      appName: 'ImageVerseApp', // Added for better logging on Atlas side
      retryWrites: true,        // Explicitly enable
      retryReads: true          // Explicitly enable
    });

    console.log(`MongoDB (connectToDb-${connectionId}): Attempting to connect new MongoClient... (timeouts: connect 30s, socket 45s, serverSelect 30s)`);
    await newClient.connect();
    console.log(`MongoDB (connectToDb-${connectionId}): New MongoClient connected successfully.`);

    const newDbInstance = newClient.db(DB_NAME);
    console.log(`MongoDB (connectToDb-${connectionId}): Obtained DB instance for "${DB_NAME}".`);

    const newBucketInstance = new GridFSBucket(newDbInstance, { bucketName: 'images' });
    console.log(`MongoDB (connectToDb-${connectionId}): Initialized GridFS bucket "images" on DB "${DB_NAME}".`);

    client = newClient;
    dbInstance = newDbInstance;
    bucketInstance = newBucketInstance;

    console.log(`MongoDB (connectToDb-${connectionId}): Successfully established and cached new connection to database "${DB_NAME}" and GridFS bucket "images".`);
    return { client, db: dbInstance, bucket: bucketInstance };

  } catch (error: any) {
    let criticalCheckMessage = "General MongoDB connection issue.";
    if (error.name === 'MongoServerSelectionError') {
        criticalCheckMessage = "CRITICAL CHECK (MongoServerSelectionError): Even if '0.0.0.0/0' is set in Atlas IP Access List, this error often means your application server cannot reach or select any of the MongoDB replica set members. \n1. VERIFY YOUR WORKSTATION'S CURRENT PUBLIC IP: Ensure this IP is *explicitly* in the Atlas IP Access List, or that '0.0.0.0/0' is correctly applied and active. \n2. ATLAS CLUSTER HEALTH: Check your Atlas cluster dashboard for any alerts, high load, or ongoing maintenance. \n3. NETWORK PATH: Investigate potential network issues between your Cloud Workstation and Atlas (e.g., VPC firewalls, proxies, DNS problems). \n4. MONGODB_URI: Double-check your MONGODB_URI for any subtle typos or issues, especially in the hostname or replica set options if specified.";
    } else if (error.name === 'MongoParseError') {
        criticalCheckMessage = "CRITICAL CHECK (MongoParseError): The MONGODB_URI string itself is likely malformed. Please verify it meticulously against the one provided by MongoDB Atlas.";
    } else if (error.name === 'MongoAuthenticationError') {
        criticalCheckMessage = "CRITICAL CHECK (MongoAuthenticationError): Authentication failed. Verify the username and password in your MONGODB_URI.";
    }
    
    const fullErrorMessage = `MongoDB connection error: ${error.message || 'Failed to connect to database.'}\n${criticalCheckMessage}`;
    
    console.error(`MongoDB (connectToDb-${connectionId}): DATABASE CONNECTION FAILED. Details:`, {
        errorMessage: error.message,
        errorCode: error.code,
        errorName: error.name,
        errorLabels: error.errorLabels, 
        isTransient: error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError'),
        isNetworkError: error.hasErrorLabel && error.hasErrorLabel('NetworkError'),
        connectionStringUsed: MONGODB_URI_ENV.substring(0, MONGODB_URI_ENV.indexOf('://') + 3) + '<credentials_redacted>' + MONGODB_URI_ENV.substring(MONGODB_URI_ENV.indexOf('@')),
        advice: criticalCheckMessage
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
    throw new Error(fullErrorMessage); 
  }
}
