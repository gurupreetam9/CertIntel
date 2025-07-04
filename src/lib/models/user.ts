
import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'student';
export type LinkRequestStatus = 'pending' | 'accepted' | 'rejected' | 'none';

export interface UserProfile {
  uid: string;
  email: string | null;
  role: UserRole;
  displayName?: string | null; // For students, this will be their entered name
  isPublicProfileEnabled?: boolean; // NEW: To enable/disable public showcase URL
  
  // Admin specific
  adminUniqueId?: string; // Shareable ID for admins

  // Student specific
  rollNo?: string;
  associatedAdminFirebaseId?: string | null; // Firebase UID of the linked Admin
  associatedAdminUniqueId?: string | null; // The unique ID of the admin they linked/requested to link with
  linkRequestStatus?: LinkRequestStatus;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AdminProfile {
  userId: string; // Firebase UID
  adminUniqueId: string; // Shareable, generated ID
  email: string;
  createdAt: Timestamp;
}

export interface StudentLinkRequest {
  id?: string; // Firestore document ID
  studentUserId: string;
  studentEmail: string;
  studentName: string;
  studentRollNo?: string | null;
  adminUniqueIdTargeted: string; // The unique ID of the admin the student entered
  adminFirebaseId?: string; // Firebase UID of the admin (once validated)
  status: Extract<LinkRequestStatus, 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'revoked_by_admin'>; // More specific status for requests
  requestedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string; // Admin's or Student's UID who resolved/cancelled it
}
