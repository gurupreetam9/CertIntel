
import { MongoClient, Db, GridFSBucket, ServerApiVersion } from 'mongodb';

const MONGODB_URI_ENV = process.env.MONGODB_URI;
const MONGODB_DB_NAME_ENV = process.env.MONGODB_DB_NAME;
const DESIRED_DB_NAME = 'imageverse_db';

let DB_NAME_TO_USE: string;

if (MONGODB_DB_NAME_ENV && MONGODB_DB_NAME_ENV !== DESIRED_DB_NAME) {
  console.warn(
    `MongoDB Lib: Environment variable MONGODB_DB_NAME was found and set to "${MONGODB_DB_NAME_ENV}", ` +
    `but the application is configured to use "${DESIRED_DB_NAME}". ` +
    `Proceeding with "${DESIRED_DB_NAME}". Please verify your .env.local file if this is unexpected.`
  );
  DB_NAME_TO_USE = DESIRED_DB_NAME;
} else if (MONGODB_DB_NAME_ENV === DESIRED_DB_NAME) {
  console.log(`MongoDB Lib: Using database name "${DESIRED_DB_NAME}" from MONGODB_DB_NAME environment variable.`);
  DB_NAME_TO_USE = MONGODB_DB_NAME_ENV;
} else {
  console.log(`MongoDB Lib: MONGODB_DB_NAME environment variable not set or empty. Using default database name "${DESIRED_DB_NAME}".`);
  DB_NAME_TO_USE = DESIRED_DB_NAME;
}


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
  
  console.log(`MongoDB (connectToDb-${connectionId}): Attempting connection. Target DB: "${DB_NAME_TO_USE}".`);
  console.log(`MongoDB (connectToDb-${connectionId}): IMPORTANT: Please MANUALLY VERIFY your MONGODB_URI in .env.local. Ensure it is EXACTLY as provided by MongoDB Atlas, including any options like 'retryWrites=true&w=majority'. Check for typos or accidental modifications. URI being used (credentials redacted): ${MONGODB_URI_ENV.substring(0, MONGODB_URI_ENV.indexOf('://') + 3) + '<credentials_redacted>' + MONGODB_URI_ENV.substring(MONGODB_URI_ENV.indexOf('@'))}`);
  console.log(`MongoDB (connectToDb-${connectionId}): ALSO IMPORTANT: Please check your MongoDB Atlas cluster status directly in the Atlas dashboard to ensure it's healthy and there are no ongoing maintenance activities or alerts. Ensure your Atlas IP Access List includes your Workstation's current public IP or '0.0.0.0/0' (for testing).`);

  if (client && dbInstance && bucketInstance) {
    try {
      console.log(`MongoDB (connectToDb-${connectionId}): Found existing client. Pinging DB "${DB_NAME_TO_USE}" to check connection health...`);
      await client.db(DB_NAME_TO_USE).command({ ping: 1 });
      console.log(`MongoDB (connectToDb-${connectionId}): Ping to existing client for DB "${DB_NAME_TO_USE}" was SUCCESSFUL. Re-using existing connection.`);
      return { client, db: dbInstance, bucket: bucketInstance };
    } catch (pingError: any) {
      console.warn(`MongoDB (connectToDb-${connectionId}): Ping to existing client failed for DB "${DB_NAME_TO_USE}". It might be unresponsive or the connection was dropped. Will attempt to close and reconnect. Ping Error:`, { message: pingError.message, code: pingError.code, name: pingError.name });
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

    const newDbInstance = newClient.db(DB_NAME_TO_USE);
    console.log(`MongoDB (connectToDb-${connectionId}): Obtained DB instance for "${DB_NAME_TO_USE}".`);

    // Ensure indexes are created for performance
    try {
      const filesCollection = newDbInstance.collection('images.files');
      await filesCollection.createIndex({ 'metadata.courseName': 'text' }, { name: 'courseName_text_index' });
      await filesCollection.createIndex({ 'metadata.userId': 1 }, { name: 'userId_index' });
      console.log(`MongoDB (connectToDb-${connectionId}): Ensured indexes on 'images.files' collection.`);
    } catch (indexError: any) {
      console.warn(`MongoDB (connectToDb-${connectionId}): Could not create/update indexes. This is not critical for startup but may impact query performance. Error: ${indexError.message}`);
    }

    const newBucketInstance = new GridFSBucket(newDbInstance, { bucketName: 'images' });
    console.log(`MongoDB (connectToDb-${connectionId}): Initialized GridFS bucket "images" on DB "${DB_NAME_TO_USE}".`);

    client = newClient;
    dbInstance = newDbInstance;
    bucketInstance = newBucketInstance;

    console.log(`MongoDB (connectToDb-${connectionId}): Successfully established and cached new connection to database "${DB_NAME_TO_USE}" and GridFS bucket "images".`);
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
