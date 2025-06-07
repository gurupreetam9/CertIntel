
import { MongoClient, Db, GridFSBucket, ServerApiVersion } from 'mongodb';

const MONGODB_URI_ENV = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'imageverse_db';

if (!MONGODB_URI_ENV) {
  const errorMsg = 'CRITICAL: MONGODB_URI is not set in environment variables. The application cannot connect to the database. Please check your .env.local file and ensure the Next.js server is restarted after any changes.';
  console.error("MongoDB Lib Startup Error:", errorMsg);
  // This will cause the application to fail to start if the URI is missing, which is intended.
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
  console.log(`MongoDB (connectToDb-${connectionId}): IMPORTANT: Please MANUALLY VERIFY your MONGODB_URI in .env.local. Ensure it is EXACTLY as provided by MongoDB Atlas, including any options like 'retryWrites=true&w=majority'. Check for typos or accidental modifications.`);
  console.log(`MongoDB (connectToDb-${connectionId}): ALSO IMPORTANT: Please check your MongoDB Atlas cluster status directly in the Atlas dashboard to ensure it's healthy and there are no ongoing maintenance activities or alerts.`);


  if (client && dbInstance && bucketInstance) {
    try {
      console.log(`MongoDB (connectToDb-${connectionId}): Found existing client. Pinging DB "${DB_NAME}" to check connection health...`);
      await client.db(DB_NAME).command({ ping: 1 });
      console.log(`MongoDB (connectToDb-${connectionId}): Existing client connection to DB "${DB_NAME}" is healthy. Re-using.`);
      return { client, db: dbInstance, bucket: bucketInstance };
    } catch (pingError: any) {
      console.warn(`MongoDB (connectToDb-${connectionId}): Ping to existing client failed. It might be unresponsive or the connection was dropped. Will attempt to close and reconnect. Ping Error:`, { message: pingError.message, code: pingError.code, name: pingError.name });
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
    let detailedErrorMessage = `MongoDB connection error: ${error.message || 'Failed to connect to database and initialize resources.'}`;
    if (error.name === 'MongoServerSelectionError' || (error.message && error.message.toLowerCase().includes('server selection timed out'))) {
        detailedErrorMessage += "\nCRITICAL CHECK: Even if 0.0.0.0/0 is set, this error often means your application server cannot reach any of the MongoDB replica set members. Double-check your MongoDB Atlas 'Network Access' IP list. Verify your server's public IP. Check for any VPNs, proxies, or complex network configurations on your Cloud Workstation that might alter its outbound IP or routing. Also, ensure the Atlas cluster itself is healthy (check Atlas dashboard).";
    } else if (error.name === 'MongoParseError') {
        detailedErrorMessage += "\nCRITICAL CHECK: The MONGODB_URI string itself might be malformed. Please verify it meticulously.";
    } else if (error.name === 'MongoAuthenticationError') {
        detailedErrorMessage += "\nCRITICAL CHECK: Authentication failed. Verify the username and password in your MONGODB_URI.";
    }
    
    console.error(`MongoDB (connectToDb-${connectionId}): DATABASE CONNECTION FAILED. Details:`, {
        errorMessage: error.message,
        errorCode: error.code,
        errorName: error.name,
        errorLabels: error.errorLabels, // Provides context like TransientTransactionError, NetworkError
        isTransient: error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError'),
        isNetworkError: error.hasErrorLabel && error.hasErrorLabel('NetworkError'),
        connectionStringUsed: MONGODB_URI_ENV.substring(0, MONGODB_URI_ENV.indexOf('://') + 3) + '<credentials_redacted>' + MONGODB_URI_ENV.substring(MONGODB_URI_ENV.indexOf('@')),
        advice: "Refer to the CRITICAL CHECK message above based on the errorName. If MongoServerSelectionError, it's highly likely a network path or IP whitelist issue with Atlas."
    });

    if (client) { // Attempt to close the client if it was instantiated but failed to connect fully
      try {
        await client.close();
        console.log(`MongoDB (connectToDb-${connectionId}): Closed client after connection failure.`);
      } catch (closeErr: any) {
        console.error(`MongoDB (connectToDb-${connectionId}): Error closing client after connection failure:`, { message: closeErr.message });
      }
    }
    client = undefined; // Ensure client is cleared so next attempt is fresh
    dbInstance = undefined;
    bucketInstance = undefined;
    throw new Error(detailedErrorMessage); 
  }
}
