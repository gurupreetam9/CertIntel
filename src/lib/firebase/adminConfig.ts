
'use server';

import admin from 'firebase-admin';

// Ensure that this file is only processed on the server
if (typeof window !== 'undefined') {
  throw new Error('Firebase Admin SDK can only be used on the server.');
}

if (!admin.apps.length) {
  try {
    const serviceAccountEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set. Admin SDK cannot be initialized without it.");
    }

    // This is the most reliable way: service account JSON content is in the env var.
    if (serviceAccountEnv && serviceAccountEnv.trim().startsWith('{')) {
      console.log('Firebase Admin SDK: Attempting initialization using JSON content from GOOGLE_APPLICATION_CREDENTIALS.');
      const serviceAccount = JSON.parse(serviceAccountEnv);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId, // Prefer project_id from the key itself
      });
      console.log('Firebase Admin SDK: Initialized successfully using JSON content.');
    
    // This is the standard for deployed Google Cloud environments (App Hosting, Cloud Run, etc.)
    // It will also pick up file paths from GOOGLE_APPLICATION_CREDENTIALS for local dev.
    } else {
        console.log('Firebase Admin SDK: GOOGLE_APPLICATION_CREDENTIALS is not a JSON object. Attempting initialization using Application Default Credentials (ADC).');
        if (serviceAccountEnv) {
            console.log(`Firebase Admin SDK: The GOOGLE_APPLICATION_CREDENTIALS environment variable is set and will be used by ADC as a file path: '${serviceAccountEnv}'`);
        } else {
            console.log('Firebase Admin SDK: The GOOGLE_APPLICATION_CREDENTIALS environment variable is NOT set. ADC will attempt to use ambient credentials from the environment (e.g., metadata server).');
        }

        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: projectId,
        });

        console.log('Firebase Admin SDK: Initialized successfully using Application Default Credentials (ADC). NOTE: Runtime authentication errors can still occur if the ADC environment is not configured correctly (e.g., IAM permissions, network access to metadata server).');
    }
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 400)
    });
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined) {
        console.warn("\n--- Firebase Admin SDK Development Hint ---\nFor local development, the easiest way to authenticate is to run `gcloud auth application-default login` in your terminal. Alternatively, set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the absolute file path of your service account key JSON file.\n------------------------------------------\n");
    }
    if (error.message && error.message.includes("ENOENT")) {
        console.warn("\n--- Firebase Admin SDK HINT (ENOENT) ---\nThe error 'ENOENT' (no such file or directory) usually means the GOOGLE_APPLICATION_CREDENTIALS environment variable is set to a file path that does not exist. Please verify the path is correct and accessible.\n------------------------------------------\n");
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
