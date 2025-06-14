
import { firestore } from '@/lib/firebase/config'; // For client-side SDK Firestore
// Removed: import { adminFirestore } from '@/lib/firebase/adminConfig'; 
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
} from 'firebase/firestore'; // Client-side SDK imports
import { v4 as uuidv4 } from 'uuid';

const USERS_COLLECTION = 'users';
const ADMINS_COLLECTION = 'admins';
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';

// --- User Profile (Common, client-side SDK) ---
export const createUserProfileDocument = async (
  userId: string,
  email: string,
  role: UserRole,
  additionalData: Partial<UserProfile> = {}
): Promise<UserProfile> => {
  const userDocRef = doc(firestore, USERS_COLLECTION, userId); // Uses client-side `firestore`
  const now = Timestamp.now();
  
  const profileData: Partial<UserProfile> = {
    uid: userId,
    email,
    role,
    displayName: additionalData.displayName || email.split('@')[0],
    createdAt: now,
    updatedAt: now,
  };

  if (role === 'student') {
    profileData.rollNo = additionalData.rollNo !== undefined ? additionalData.rollNo : null;
    profileData.linkRequestStatus = additionalData.linkRequestStatus || 'none';
    profileData.associatedAdminFirebaseId = additionalData.associatedAdminFirebaseId !== undefined ? additionalData.associatedAdminFirebaseId : null;
    profileData.associatedAdminUniqueId = additionalData.associatedAdminUniqueId !== undefined ? additionalData.associatedAdminUniqueId : null;
  } else if (role === 'admin') {
    if (additionalData.adminUniqueId) {
      profileData.adminUniqueId = additionalData.adminUniqueId;
    }
  }

  const finalProfileData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined)
  ) as UserProfile;

  await setDoc(userDocRef, finalProfileData, { merge: true });
  return finalProfileData; 
};

// Used by client-side AuthContext and potentially other client components
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) {
    console.warn("userService (getUserProfile - client): Called with no userId.");
    return null;
  }
  const userDocRef = doc(firestore, USERS_COLLECTION, userId); // Uses client-side `firestore`
  try {
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserProfile;
    }
    console.log(`userService (getUserProfile - client): No profile found for userId ${userId}.`);
    return null;
  } catch (error: any) {
     console.error(`userService (getUserProfile - client): Error fetching profile for userId ${userId}: ${error.message}`, error);
     // Consider how to handle this - rethrow, return null with error state, etc.
     // For client-side, often returning null and letting UI handle "profile not found" is okay.
     return null;
  }
};

// --- REMOVED getAnyUserProfileWithAdmin as it used adminFirestore ---
// This function's logic will be inlined into the API route that needs it.


// --- Admin Specific (Client SDK for admin actions triggered from client, e.g. profile creation) ---
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

// --- Student Specific & Linkage (Client SDK) ---
export const createStudentLinkRequest = async (
  studentUserId: string,
  studentEmail: string,
  studentName: string,
  studentRollNo: string | null,
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
    studentRollNo: studentRollNo !== undefined ? studentRollNo : null, 
    adminUniqueIdTargeted: targetAdminUniqueId,
    adminFirebaseId: targetAdminFirebaseId,
    status: 'pending',
    requestedAt: now,
  };
  await setDoc(requestDocRef, linkRequest);
  
  const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);
  await setDoc(studentUserDocRef, { 
    linkRequestStatus: 'pending', 
    associatedAdminUniqueId: targetAdminUniqueId, 
    associatedAdminFirebaseId: targetAdminFirebaseId,
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
    studentUpdateData.associatedAdminFirebaseId = adminFirebaseIdResolving;
  } else { 
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

// Make sure updateUserProfileDocument is defined and exported if used in ProfileSettings
export const updateUserProfileDocument = async (userId: string, data: Partial<UserProfile>): Promise<{ success: boolean, message?: string }> => {
  if (!userId) return { success: false, message: 'User ID is required.'};
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  try {
    await setDoc(userDocRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user profile document:", error);
    return { success: false, message: error.message || "Failed to update profile." };
  }
};
