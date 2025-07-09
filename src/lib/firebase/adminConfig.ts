
import admin from 'firebase-admin';

// Ensure that this file is only processed on the server
if (typeof window !== 'undefined') {
  throw new Error('Firebase Admin SDK can only be used on the server.');
}

if (!admin.apps.length) {
  console.log('Firebase Admin SDK: Initializing a new Firebase app...');

  try {
    const serviceAccountEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    // Log the state of relevant environment variables for debugging
    console.log(`Firebase Admin SDK Debug: NEXT_PUBLIC_FIREBASE_PROJECT_ID = "${projectId}"`);
    if (serviceAccountEnv) {
      const isJson = serviceAccountEnv.trim().startsWith('{');
      console.log(`Firebase Admin SDK Debug: GOOGLE_APPLICATION_CREDENTIALS is SET. Length: ${serviceAccountEnv.length}. Is it JSON? ${isJson}.`);
      if (!isJson) {
        console.log(`Firebase Admin SDK Debug: GOOGLE_APPLICATION_CREDENTIALS is treated as a file path: "${serviceAccountEnv}"`);
      }
    } else {
      console.log('Firebase Admin SDK Debug: GOOGLE_APPLICATION_CREDENTIALS is NOT SET.');
    }

    if (!projectId) {
      throw new Error("CRITICAL: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set. Admin SDK cannot be initialized without it.");
    }

    let credential;
    if (serviceAccountEnv && serviceAccountEnv.trim().startsWith('{')) {
      console.log('Firebase Admin SDK: Using JSON from GOOGLE_APPLICATION_CREDENTIALS.');
      const serviceAccount = JSON.parse(serviceAccountEnv);
      credential = admin.credential.cert(serviceAccount);
    } else {
      console.log('Firebase Admin SDK: Using Application Default Credentials (ADC).');
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      projectId,
    });

    console.log('Firebase Admin SDK: Initialization successful.');

  } catch (error: any) {
    console.error('CRITICAL: Firebase Admin SDK initialization FAILED.');
    console.error({
      errorMessage: error.message,
      errorCode: error.code,
      errorStack: error.stack?.substring(0, 500) // Log a portion of the stack
    });
    
    // Add helpful hints based on common errors
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined) {
      console.warn("\n--- Firebase Admin SDK Development Hint ---\nFor local development with ADC, run `gcloud auth application-default login` in your terminal. Alternatively, set GOOGLE_APPLICATION_CREDENTIALS to the absolute path of your service account JSON file.\n------------------------------------------\n");
    }
    if (error.message && (error.message.includes("ENOENT") || error.message.includes("no such file or directory"))) {
      console.warn("\n--- Firebase Admin SDK HINT (ENOENT) ---\nThe error indicates the GOOGLE_APPLICATION_CREDENTIALS file path is incorrect or the file doesn't exist. Please verify the path.\n------------------------------------------\n");
    }
     if (error.message && error.message.includes("Permission denied")) {
      console.warn("\n--- Firebase Admin SDK HINT (Permission Denied) ---\nThe credentials being used do not have sufficient IAM permissions to access Firebase/Google Cloud services. Check the roles of the service account or user associated with your credentials (e.g., `gcloud auth list`).\n------------------------------------------\n");
    }
  }
}


let adminAuthInstance: admin.auth.Auth | undefined;
let adminFirestoreInstance: admin.firestore.Firestore | undefined;

if (admin.apps.length > 0) {
  try {
    adminAuthInstance = admin.auth();
    if (!adminAuthInstance) {
      console.error('Firebase Admin SDK critical error: admin.auth() returned undefined after app initialization.');
    }
  } catch (e: any) {
    console.error('Firebase Admin SDK critical error: Error getting Auth instance:', e.message, e);
  }

  try {
    adminFirestoreInstance = admin.firestore();
    if (!adminFirestoreInstance) {
      console.error('Firebase Admin SDK critical error: admin.firestore() returned undefined after app initialization.');
    }
  } catch (e: any) {
    console.error('Firebase Admin SDK critical error: Error getting Firestore instance:', e.message, e);
  }
} else {
  console.error('Firebase Admin SDK critical error: No Firebase apps initialized. Auth and Firestore instances will be undefined. Check initialization logs.');
}

export const getAdminAuth = (): admin.auth.Auth => {
  if (!adminAuthInstance) {
    throw new Error("Firebase Admin Auth service is not available. Check server logs for initialization errors. It's possible GOOGLE_APPLICATION_CREDENTIALS are not set up correctly or the Admin SDK failed to initialize.");
  }
  return adminAuthInstance;
};

export const getAdminFirestore = (): admin.firestore.Firestore => {
  if (!adminFirestoreInstance) {
    throw new Error("Firebase Admin Firestore service is not available. Check server logs for initialization errors. It's possible GOOGLE_APPLICATION_CREDENTIALS are not set up correctly or the Admin SDK failed to initialize.");
  }
  return adminFirestoreInstance;
};

// For convenience, you can also export the instances directly if you prefer,
// but the getters provide a clear failure point.
export const adminAuth = adminAuthInstance;
export const adminFirestore = adminFirestoreInstance;
