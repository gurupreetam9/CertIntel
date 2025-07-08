// HACK: In-memory store for OTPs. NOT SUITABLE FOR PRODUCTION.
// In a real app, use a database (e.g., Firestore, Redis) for OTP storage.

interface OtpEntry {
  otp: string;
  expiresAt: number;
}

// Ensure the store is a global singleton to persist across hot reloads in dev
if (!(globalThis as any).otpStore) {
  (globalThis as any).otpStore = {};
}
const otpStore: Record<string, OtpEntry> = (globalThis as any).otpStore;

export const setOtp = (key: string, otp: string, ttlMinutes: number = 5): void => {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  otpStore[key] = { otp, expiresAt };
  console.log(`[otpStore] OTP for key "${key}" set to "${otp}".`);
};

export const getOtp = (key: string): OtpEntry | undefined => {
  return otpStore[key];
};

export const deleteOtp = (key: string): void => {
  if (otpStore[key]) {
    delete otpStore[key];
    console.log(`[otpStore] OTP for key "${key}" deleted.`);
  }
};
