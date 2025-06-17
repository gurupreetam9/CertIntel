
import admin from 'firebase-admin';

// Ensure that this file is only processed on the server
if (typeof window !== 'undefined') {
  throw new Error('Firebase Admin SDK can only be used on the server.');
}

if (!admin.apps.length) {
  try {
    const serviceAccountEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (serviceAccountEnv) {
      if (serviceAccountEnv.trim().startsWith('{')) {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin SDK initialized successfully using JSON content from GOOGLE_APPLICATION_CREDENTIALS.');
      } else {
        admin.initializeApp();
        console.log('Firebase Admin SDK initialized successfully using GOOGLE_APPLICATION_CREDENTIALS file path or Application Default Credentials.');
      }
    } else {
      admin.initializeApp();
      console.log('Firebase Admin SDK initialized successfully using Application Default Credentials.');
    }
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message, error);
    if (process.env.NODE_ENV === 'development') {
        console.warn("DEVELOPMENT HINT: For local Firebase Admin SDK, ensure GOOGLE_APPLICATION_CREDENTIALS points to your service account key JSON *file*, or that the JSON content is correctly parsed if provided directly in an environment variable.");
        if (error.message && error.message.includes("ENOENT")) {
             console.warn("The error ENOENT (no such file or directory) often means the value of GOOGLE_APPLICATION_CREDENTIALS was treated as a file path but was actually JSON content or an invalid path. The updated config tries to handle JSON content directly.");
        }
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
