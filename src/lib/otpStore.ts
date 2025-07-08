
// This file uses the Firebase Admin SDK to store OTPs in Firestore.
// It is intended for SERVER-SIDE use only.

import { getAdminFirestore } from './firebase/adminConfig';

const OTP_COLLECTION = 'otpStore';

interface OtpDocument {
    otp: string;
    expiresAt: FirebaseFirestore.Timestamp;
}

/**
 * Saves or updates an OTP for a given key (e.g., email) in Firestore.
 * @param key The identifier for the OTP, typically the user's email.
 * @param otp The 6-digit one-time password.
 * @param ttlMinutes The time-to-live for the OTP in minutes.
 */
export const setOtp = async (key: string, otp: string, ttlMinutes: number = 5): Promise<void> => {
  const adminFirestore = getAdminFirestore();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const otpRef = adminFirestore.collection(OTP_COLLECTION).doc(key);
  await otpRef.set({
    otp,
    expiresAt, // The Admin SDK will automatically convert the Date object to a Firestore Timestamp
  });
  console.log(`[otpStore:Firestore] OTP for key "${key}" set to "${otp}".`);
};

/**
 * Retrieves an OTP entry from Firestore.
 * @param key The identifier for the OTP.
 * @returns The OTP document containing the OTP and its expiration Timestamp, or undefined if not found.
 */
export const getOtp = async (key: string): Promise<OtpDocument | undefined> => {
  const adminFirestore = getAdminFirestore();
  const otpRef = adminFirestore.collection(OTP_COLLECTION).doc(key);
  const docSnap = await otpRef.get();

  if (!docSnap.exists) {
    return undefined;
  }
  return docSnap.data() as OtpDocument;
};

/**
 * Deletes an OTP from Firestore after it has been used or has expired.
 * @param key The identifier for the OTP to delete.
 */
export const deleteOtp = async (key: string): Promise<void> => {
    const adminFirestore = getAdminFirestore();
    const otpRef = adminFirestore.collection(OTP_COLLECTION).doc(key);
    await otpRef.delete();
    console.log(`[otpStore:Firestore] OTP for key "${key}" deleted.`);
};
