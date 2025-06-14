
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirestore, type Firestore } from 'firebase/firestore'; // Added Firestore import

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate Firebase config
if (!firebaseConfig.apiKey) {
  const errorMessage = `
CRITICAL FIREBASE CONFIGURATION ERROR: NEXT_PUBLIC_FIREBASE_API_KEY is missing.

The application cannot initialize Firebase services without a valid API Key.
Please ensure:
1. You have a .env.local file in the root of your project.
2. NEXT_PUBLIC_FIREBASE_API_KEY (and other NEXT_PUBLIC_FIREBASE_* variables) are correctly set in this file with values from your Firebase project settings.
3. You have RESTARTED your Next.js development server after modifying the .env.local file.

This is a local environment configuration issue. The application code cannot proceed.
`;
  console.error(errorMessage);
  throw new Error("CRITICAL FIREBASE CONFIGURATION ERROR: NEXT_PUBLIC_FIREBASE_API_KEY is missing. Check console for details.");
} else if (!firebaseConfig.projectId) {
  const errorMessage = `
CRITICAL FIREBASE CONFIGURATION ERROR: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing.

Firestore (and other services) cannot function without a Project ID.
Please ensure:
1. You have a .env.local file in the root of your project.
2. NEXT_PUBLIC_FIREBASE_PROJECT_ID is correctly set in this file.
3. You have RESTARTED your Next.js development server after modifying the .env.local file.
`;
  console.error(errorMessage);
  throw new Error("CRITICAL FIREBASE CONFIGURATION ERROR: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing. Check console for details.");
} else if (
  !firebaseConfig.authDomain ||
  !firebaseConfig.storageBucket ||
  !firebaseConfig.messagingSenderId ||
  !firebaseConfig.appId
) {
  console.warn(
    'Firebase configuration is incomplete (other fields like authDomain, storageBucket, etc., might be missing, but API_KEY and PROJECT_ID were found). Please check your .env.local file thoroughly. Some Firebase features may not work as expected.'
  );
}


let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);
const firestore: Firestore = getFirestore(app); // Initialize Firestore

export { app, auth, storage, firestore }; // Export firestore

