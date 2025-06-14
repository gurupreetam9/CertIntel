
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
  const userProfile: UserProfile = {
    uid: userId,
    email,
    role,
    displayName: additionalData.displayName || email.split('@')[0],
    rollNo: additionalData.rollNo,
    linkRequestStatus: additionalData.adminUniqueId ? 'pending' : 'none',
    associatedAdminUniqueId: additionalData.adminUniqueId || null,
    createdAt: now,
    updatedAt: now,
    ...additionalData, // Spread specific fields for student or admin if necessary
  };

  await setDoc(userDocRef, userProfile, { merge: true });
  return userProfile;
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
  const adminDocRef = doc(firestore, ADMINS_COLLECTION, userId); // Use Firebase UID as doc ID
  // Generate a shorter, more user-friendly unique ID for admins to share
  const adminUniqueId = uuidv4().substring(0, 8).toUpperCase();
  const now = Timestamp.now();

  const adminProfile: AdminProfile = {
    userId,
    adminUniqueId,
    email,
    createdAt: now,
  };
  await setDoc(adminDocRef, adminProfile);

  // Also create/update their main user profile document
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
  studentRollNo: string | undefined,
  targetAdminUniqueId: string,
  targetAdminFirebaseId: string
): Promise<StudentLinkRequest> => {
  const requestDocRef = doc(collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION)); // Auto-generate ID
  const now = Timestamp.now();

  const linkRequest: StudentLinkRequest = {
    id: requestDocRef.id,
    studentUserId,
    studentEmail,
    studentName,
    studentRollNo,
    adminUniqueIdTargeted: targetAdminUniqueId,
    adminFirebaseId: targetAdminFirebaseId,
    status: 'pending',
    requestedAt: now,
  };
  await setDoc(requestDocRef, linkRequest);
  
  // Update student's user profile to reflect pending request
  const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);
  await setDoc(studentUserDocRef, { 
    linkRequestStatus: 'pending', 
    associatedAdminUniqueId: targetAdminUniqueId,
    associatedAdminFirebaseId: targetAdminFirebaseId, // Store admin's firebase UID
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
  adminFirebaseIdResolving: string, // UID of the admin taking action
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
  
  // Update the request document
  batch.update(requestDocRef, {
    status: newStatus,
    resolvedAt: serverTimestamp(),
    resolvedBy: adminFirebaseIdResolving
  });

  // Update the student's user profile document
  const studentUserDocRef = doc(firestore, USERS_COLLECTION, requestData.studentUserId);
  const studentUpdateData: Partial<UserProfile> = {
    linkRequestStatus: newStatus,
    updatedAt: serverTimestamp(),
  };

  if (newStatus === 'accepted') {
    studentUpdateData.associatedAdminFirebaseId = requestData.adminFirebaseId;
    // associatedAdminUniqueId should already be there from request time
  } else { // 'rejected' or other non-accepted status
    studentUpdateData.associatedAdminFirebaseId = null; 
    // We can keep associatedAdminUniqueId if we want to show them who they requested from,
    // or clear it too: studentUpdateData.associatedAdminUniqueId = null;
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

