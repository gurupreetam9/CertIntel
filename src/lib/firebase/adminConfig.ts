
import admin from 'firebase-admin';

// Ensure that this file is only processed on the server
if (typeof window !== 'undefined') {
  throw new Error('Firebase Admin SDK can only be used on the server.');
}

if (!admin.apps.length) {
  try {
    // For Firebase App Hosting and environments with GOOGLE_APPLICATION_CREDENTIALS set,
    // initializeApp() without arguments should work.
    // For local development without GOOGLE_APPLICATION_CREDENTIALS, you might need:
    // const serviceAccount = require('/path/to/your/serviceAccountKey.json'); // Adjust path
    // admin.initializeApp({
    //   credential: admin.credential.cert(serviceAccount)
    // });
    admin.initializeApp();
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message);
    // Depending on your error handling strategy, you might want to:
    // 1. Rethrow the error to halt server startup if Admin SDK is critical.
    // 2. Log and continue, letting downstream operations fail if they depend on it.
    // For now, log and continue. Routes using admin will fail if not initialized.
    // Consider adding process.env.NODE_ENV === 'development' check for more detailed local errors.
    if (process.env.NODE_ENV === 'development' && error.message.includes('GOOGLE_APPLICATION_CREDENTIALS')) {
        console.warn("DEVELOPMENT HINT: To use Firebase Admin SDK locally, ensure the GOOGLE_APPLICATION_CREDENTIALS environment variable is set to the path of your service account key JSON file, or initialize admin.initializeApp({ credential: admin.credential.cert(...) }) with your service account details directly in this file (for local testing only).");
    }
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
