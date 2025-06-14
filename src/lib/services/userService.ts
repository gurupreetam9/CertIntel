
import { firestore } from '@/lib/firebase/config';
import type { UserProfile, AdminProfile, StudentLinkRequest, UserRole, LinkRequestStatus } from '@/lib/models/user';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  Timestamp,
  writeBatch,
  serverTimestamp,
  getDocs,
  limit,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

const USERS_COLLECTION = 'users';
const ADMINS_COLLECTION = 'admins';
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';

// --- User Profile (Common) ---
export const createUserProfileDocument = async (
  userId: string,
  email: string,
  role: UserRole,
  additionalData: Partial<UserProfile> = {}
): Promise<UserProfile> => {
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  const now = Timestamp.now();
  
  // Start with base profile data common to all roles
  const profileData: Partial<UserProfile> = {
    uid: userId,
    email,
    role,
    displayName: additionalData.displayName || email.split('@')[0], // Default display name
    createdAt: now,
    updatedAt: now,
  };

  // Add role-specific fields, ensuring 'null' for empty optional student fields
  // and handling adminUniqueId for admins.
  if (role === 'student') {
    // rollNo is string | null, never undefined if coming from verify-email-otp-and-register
    profileData.rollNo = additionalData.rollNo !== undefined ? additionalData.rollNo : null;
    profileData.linkRequestStatus = additionalData.linkRequestStatus || 'none';
    // associatedAdminFirebaseId is set by updateStudentLinkRequestStatusAndLinkStudent or during link failure in registration
    profileData.associatedAdminFirebaseId = additionalData.associatedAdminFirebaseId !== undefined ? additionalData.associatedAdminFirebaseId : null;
    // associatedAdminUniqueId is the ID the student tried to link with
    profileData.associatedAdminUniqueId = additionalData.associatedAdminUniqueId !== undefined ? additionalData.associatedAdminUniqueId : null;
  } else if (role === 'admin') {
    // adminUniqueId is specific to admin role within the 'users' collection context
    // It's primarily stored in the 'admins' collection but denormalized here for easier access.
    // If createAdminProfile calls this, it will pass adminUniqueId in additionalData.
    if (additionalData.adminUniqueId) {
      profileData.adminUniqueId = additionalData.adminUniqueId;
    }
  }

  // Remove any top-level 'undefined' properties before writing to Firestore
  const finalProfileData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined)
  );

  await setDoc(userDocRef, finalProfileData, { merge: true });
  // We cast here because we've constructed it to match UserProfile
  return finalProfileData as UserProfile; 
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    return userDocSnap.data() as UserProfile;
  }
  return null;
};

// --- Admin Specific ---
export const createAdminProfile = async (userId: string, email: string): Promise<AdminProfile> => {
  const adminDocRef = doc(firestore, ADMINS_COLLECTION, userId); 
  const adminUniqueId = uuidv4().substring(0, 8).toUpperCase();
  const now = Timestamp.now();

  const adminProfile: AdminProfile = {
    userId,
    adminUniqueId,
    email,
    createdAt: now,
  };
  await setDoc(adminDocRef, adminProfile);

  // Also create/update their main user profile document in 'users' collection
  // Pass the generated adminUniqueId to be stored there as well.
  await createUserProfileDocument(userId, email, 'admin', { adminUniqueId });

  return adminProfile;
};

export const getAdminByUniqueId = async (adminUniqueId: string): Promise<AdminProfile | null> => {
  const adminsQuery = query(collection(firestore, ADMINS_COLLECTION), where('adminUniqueId', '==', adminUniqueId), limit(1));
  const querySnapshot = await getDocs(adminsQuery);
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data() as AdminProfile;
  }
  return null;
};

// --- Student Specific & Linkage ---
export const createStudentLinkRequest = async (
  studentUserId: string,
  studentEmail: string,
  studentName: string,
  studentRollNo: string | null, // Can be null
  targetAdminUniqueId: string,
  targetAdminFirebaseId: string
): Promise<StudentLinkRequest> => {
  const requestDocRef = doc(collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION)); 
  const now = Timestamp.now();

  const linkRequest: StudentLinkRequest = {
    id: requestDocRef.id,
    studentUserId,
    studentEmail,
    studentName,
    // studentRollNo can be string or null, store as is
    studentRollNo: studentRollNo !== undefined ? studentRollNo : null, 
    adminUniqueIdTargeted: targetAdminUniqueId,
    adminFirebaseId: targetAdminFirebaseId,
    status: 'pending',
    requestedAt: now,
  };
  await setDoc(requestDocRef, linkRequest);
  
  // Update student's user profile to reflect pending request and targeted admin
  // This is also handled in verify-email-otp-and-register flow, but good for consistency if called elsewhere.
  const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);
  await setDoc(studentUserDocRef, { 
    linkRequestStatus: 'pending', 
    associatedAdminUniqueId: targetAdminUniqueId, // Store the ID they are trying to link to
    associatedAdminFirebaseId: targetAdminFirebaseId, // Store the actual Firebase UID of the admin
    updatedAt: serverTimestamp() 
  }, { merge: true });

  return linkRequest;
};


export const getStudentLinkRequestsForAdmin = async (adminFirebaseId: string): Promise<StudentLinkRequest[]> => {
  const q = query(
    collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
    where('adminFirebaseId', '==', adminFirebaseId),
    where('status', '==', 'pending')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as StudentLinkRequest));
};

export const updateStudentLinkRequestStatusAndLinkStudent = async (
  requestId: string,
  adminFirebaseIdResolving: string, 
  newStatus: Extract<LinkRequestStatus, 'accepted' | 'rejected'>
): Promise<void> => {
  const batch = writeBatch(firestore);
  const requestDocRef = doc(firestore, STUDENT_LINK_REQUESTS_COLLECTION, requestId);

  const requestSnap = await getDoc(requestDocRef);
  if (!requestSnap.exists()) {
    throw new Error('Link request not found.');
  }
  const requestData = requestSnap.data() as StudentLinkRequest;

  if (requestData.adminFirebaseId !== adminFirebaseIdResolving) {
    throw new Error('Admin not authorized to resolve this request.');
  }
  
  batch.update(requestDocRef, {
    status: newStatus,
    resolvedAt: serverTimestamp(),
    resolvedBy: adminFirebaseIdResolving
  });

  const studentUserDocRef = doc(firestore, USERS_COLLECTION, requestData.studentUserId);
  const studentUpdateData: Partial<UserProfile> = {
    linkRequestStatus: newStatus,
    updatedAt: serverTimestamp(),
  };

  if (newStatus === 'accepted') {
    // associatedAdminUniqueId should already be set from the request initiation
    // Ensure associatedAdminFirebaseId is set to the resolving admin's Firebase UID
    studentUpdateData.associatedAdminFirebaseId = adminFirebaseIdResolving;
  } else { 
    // If rejected, we might clear the associated admin IDs, or leave associatedAdminUniqueId
    // for the student to know which request was rejected. For now, let's clear FirebaseId.
    studentUpdateData.associatedAdminFirebaseId = null; 
  }
  batch.update(studentUserDocRef, studentUpdateData);

  await batch.commit();
};

export const getStudentsForAdmin = async (adminFirebaseId: string): Promise<UserProfile[]> => {
  const q = query(
    collection(firestore, USERS_COLLECTION),
    where('role', '==', 'student'),
    where('associatedAdminFirebaseId', '==', adminFirebaseId),
    where('linkRequestStatus', '==', 'accepted')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => docSnap.data() as UserProfile);
};

