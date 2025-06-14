
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
        // Environment variable likely contains JSON content directly
        const serviceAccount = JSON.parse(serviceAccountEnv);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin SDK initialized successfully using JSON content from GOOGLE_APPLICATION_CREDENTIALS.');
      } else {
        // Environment variable likely contains a file path, let initializeApp handle it
        // This also covers the case where GOOGLE_APPLICATION_CREDENTIALS is correctly set to a path
        admin.initializeApp();
        console.log('Firebase Admin SDK initialized successfully using GOOGLE_APPLICATION_CREDENTIALS file path or Application Default Credentials.');
      }
    } else {
      // GOOGLE_APPLICATION_CREDENTIALS is not set, rely on Application Default Credentials (e.g., for App Hosting)
      admin.initializeApp();
      console.log('Firebase Admin SDK initialized successfully using Application Default Credentials.');
    }
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message, error);
    // More detailed logging for development
    if (process.env.NODE_ENV === 'development') {
        console.warn("DEVELOPMENT HINT: For local Firebase Admin SDK, ensure GOOGLE_APPLICATION_CREDENTIALS points to your service account key JSON *file*, or that the JSON content is correctly parsed if provided directly in an environment variable.");
        if (error.message && error.message.includes("ENOENT")) {
             console.warn("The error ENOENT (no such file or directory) often means the value of GOOGLE_APPLICATION_CREDENTIALS was treated as a file path but was actually JSON content or an invalid path. The updated config tries to handle JSON content directly.");
        }
    }
     // Depending on your error handling strategy, you might want to rethrow.
     // For now, the instances below will be uninitialized if this fails.
  }
}

let adminAuthInstance: admin.auth.Auth;
let adminFirestoreInstance: admin.firestore.Firestore;

try {
  adminAuthInstance = admin.auth();
  adminFirestoreInstance = admin.firestore();
} catch (e: any) {
    console.error("Failed to get Firebase Admin Auth or Firestore instance. Admin SDK might not have initialized properly.", e.message);
    // Provide dummy instances or throw to prevent app from running in a broken state
    // This is a basic fallback; a more robust solution might be needed.
    adminAuthInstance = {} as admin.auth.Auth; // This will cause errors if used
    adminFirestoreInstance = {} as admin.firestore.Firestore; // This will cause errors if used
}


export const adminAuth = adminAuthInstance;
export const adminFirestore = adminFirestoreInstance;
