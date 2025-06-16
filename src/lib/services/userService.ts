
import { auth, firestore } from '@/lib/firebase/config'; // Ensure auth is imported
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
  updateDoc,
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
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  const now = Timestamp.now();

  // DIAGNOSTIC LOG for createUserProfileDocument:
  console.log(`[UserService/createUserProfileDocument] START. UID: ${userId}. ClientAuthUID: ${auth.currentUser?.uid}`);
  if (auth.currentUser?.uid !== userId) {
    console.warn(`[UserService/createUserProfileDocument] MISMATCH/NULL ClientAuthUID: '${auth.currentUser?.uid}' vs target UID: '${userId}'.`);
  }

  const profileData: UserProfile = {
    uid: userId,
    email,
    role,
    displayName: additionalData.displayName || email.split('@')[0] || userId,
    createdAt: now,
    updatedAt: now,
    // Student-specific fields initialized
    rollNo: (role === 'student' && additionalData.rollNo) ? additionalData.rollNo : null,
    linkRequestStatus: (role === 'student') ? 'none' : undefined, // Default to 'none' for students, undefined for admins
    associatedAdminFirebaseId: (role === 'student') ? null : undefined,
    associatedAdminUniqueId: (role === 'student') ? null : undefined,
    // Admin-specific field
    adminUniqueId: (role === 'admin' && additionalData.adminUniqueId) ? additionalData.adminUniqueId : undefined,
  };

  // Clean up undefined fields before setting
  const finalProfileData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined)
  ) as UserProfile; // Cast as UserProfile, assuming required fields are met by defaults

  await setDoc(userDocRef, finalProfileData); // Use setDoc without merge for initial creation
  console.log(`[UserService/createUserProfileDocument] END. Profile doc created for UID: ${userId}`);
  return finalProfileData;
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) {
    console.warn("userService (getUserProfile - client): Called with no userId.");
    return null;
  }
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  try {
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserProfile;
    }
    console.log(`userService (getUserProfile - client): No profile found for userId ${userId}.`);
    return null;
  } catch (error: any) {
     console.error(`userService (getUserProfile - client): Error fetching profile for userId ${userId}: ${error.message}`, error);
     return null;
  }
};

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
  // Also create their user profile document with admin role and adminUniqueId
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
  const studentRollNoCleaned = (studentRollNo && studentRollNo.trim() !== '') ? studentRollNo.trim() : null;

  const linkRequest: StudentLinkRequest = {
    id: requestDocRef.id,
    studentUserId,
    studentEmail,
    studentName,
    studentRollNo: studentRollNoCleaned,
    adminUniqueIdTargeted: targetAdminUniqueId,
    adminFirebaseId: targetAdminFirebaseId,
    status: 'pending',
    requestedAt: now,
  };

  // DIAGNOSTIC LOG for createStudentLinkRequest (batch part):
  const clientAuthUidForBatch = auth.currentUser?.uid;
  console.log(`[UserService/createStudentLinkRequest - BATCH] START. StudentUID: ${studentUserId}, ClientAuthUID: ${clientAuthUidForBatch}. TargetAdminUID: ${targetAdminFirebaseId}, TargetAdminUniqueId: ${targetAdminUniqueId}`);
  if (clientAuthUidForBatch !== studentUserId) {
    console.warn(`[UserService/createStudentLinkRequest - BATCH] MISMATCH/NULL ClientAuthUID: '${clientAuthUidForBatch}' vs StudentUID: '${studentUserId}'. EXPECT PERMISSION ERROR.`);
  }

  const batch = writeBatch(firestore);
  batch.set(requestDocRef, linkRequest);

  const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);
  batch.update(studentUserDocRef, {
    linkRequestStatus: 'pending',
    associatedAdminUniqueId: targetAdminUniqueId,
    associatedAdminFirebaseId: targetAdminFirebaseId,
    updatedAt: serverTimestamp()
  });
  
  console.log(`[UserService/createStudentLinkRequest - BATCH] ABOUT TO COMMIT. StudentUID: ${studentUserId}, AdminUniqueId: ${targetAdminUniqueId}. ClientAuthUID: ${clientAuthUidForBatch}`);
  try {
    await batch.commit();
    console.log(`[UserService/createStudentLinkRequest - BATCH] SUCCESS. Committed for StudentUID: ${studentUserId}. RequestID: ${linkRequest.id}`);
    return linkRequest;
  } catch (error: any) {
      console.error(`[UserService/createStudentLinkRequest - BATCH] !!! BATCH COMMIT FAILED !!! StudentUID: ${studentUserId}, Admin: ${targetAdminUniqueId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, error);
      throw error; 
  }
};

// New function for students to initiate link request from their profile
export const studentRequestLinkWithAdmin = async (
  studentUserId: string,
  studentEmail: string,
  studentName: string,
  studentRollNo: string | null,
  targetAdminUniqueId: string
): Promise<{ success: boolean; message: string; requestId?: string }> => {
  const clientAuthUid = auth.currentUser?.uid;
  console.log(`[UserService/studentRequestLinkWithAdmin] START. StudentUID_Param: ${studentUserId}, ClientAuthUID: ${clientAuthUid}, TargetAdminUniqueId: ${targetAdminUniqueId}`);

  if (!studentUserId || !auth.currentUser || clientAuthUid !== studentUserId) {
    const authStateMessage = `Auth state check: studentUserId param is '${studentUserId}', auth.currentUser is ${auth.currentUser ? `'${clientAuthUid}'` : 'null'}.`;
    console.error(`[UserService/studentRequestLinkWithAdmin] Authorization check FAILED. ${authStateMessage}`);
    return { success: false, message: `Authentication error or mismatch. Cannot proceed. Client Auth UID: ${clientAuthUid}, Target Student UID: ${studentUserId}` };
  }
  
  const studentRollNoCleaned = (studentRollNo && studentRollNo.trim() !== '') ? studentRollNo.trim() : null;

  try {
    console.log(`[UserService/studentRequestLinkWithAdmin] STEP: Calling getAdminByUniqueId for TargetAdminUniqueId: ${targetAdminUniqueId}`);
    const adminProfile = await getAdminByUniqueId(targetAdminUniqueId);
    console.log(`[UserService/studentRequestLinkWithAdmin] STEP: getAdminByUniqueId result:`, JSON.stringify(adminProfile));

    if (!adminProfile) {
      console.warn(`[UserService/studentRequestLinkWithAdmin] No admin found for unique ID: ${targetAdminUniqueId}`);
      return { success: false, message: `No Teacher/Admin found with ID: ${targetAdminUniqueId}. Please check the ID and try again.` };
    }
    console.log(`[UserService/studentRequestLinkWithAdmin] Found admin profile for ID ${targetAdminUniqueId}: Admin Firebase UID is ${adminProfile.userId}`);

    console.log(`[UserService/studentRequestLinkWithAdmin] STEP: Checking existing requests for StudentUID: ${studentUserId}, AdminFirebaseUID: ${adminProfile.userId}`);
    const existingRequestQuery = query(
      collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
      where('studentUserId', '==', studentUserId),
      where('adminFirebaseId', '==', adminProfile.userId),
      where('status', 'in', ['pending', 'accepted'])
    );
    const existingRequestSnap = await getDocs(existingRequestQuery);
    console.log(`[UserService/studentRequestLinkWithAdmin] STEP: getDocs for existing requests result: empty = ${existingRequestSnap.empty}, size = ${existingRequestSnap.size}`);

    if (!existingRequestSnap.empty) {
        const existingStatus = existingRequestSnap.docs[0].data().status;
        console.warn(`[UserService/studentRequestLinkWithAdmin] Student ${studentUserId} already has an existing request with admin ${targetAdminUniqueId} (Admin Firebase ID: ${adminProfile.userId}) with status: ${existingStatus}`);
        if (existingStatus === 'pending') {
            return { success: false, message: `You already have a pending request with Admin ID ${targetAdminUniqueId}.` };
        } else if (existingStatus === 'accepted') {
            return { success: false, message: `You are already linked with Admin ID ${targetAdminUniqueId}.` };
        }
    }

    console.log(`[UserService/studentRequestLinkWithAdmin] STEP: Calling createStudentLinkRequest. StudentUID: ${studentUserId}, AdminFirebaseUID: ${adminProfile.userId}`);
    const linkRequest = await createStudentLinkRequest(
      studentUserId,
      studentEmail,
      studentName,
      studentRollNoCleaned,
      targetAdminUniqueId,
      adminProfile.userId
    );
    console.log(`[UserService/studentRequestLinkWithAdmin] Link request successfully created by createStudentLinkRequest. Request ID: ${linkRequest.id}`);
    return { success: true, message: 'Link request sent successfully.', requestId: linkRequest.id };
  } catch (error: any) {
    console.error(`[UserService/studentRequestLinkWithAdmin] !!! OUTER CATCH BLOCK ERROR !!! StudentUID: ${studentUserId}, AdminUniqueId: ${targetAdminUniqueId}. Error Name: ${error.name}, Code: ${error.code}, Message: ${error.message}. Full Error Object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    const errorMessage = error.code ? `Firestore error (${error.code}): ${error.message}` : error.message;
    return { success: false, message: errorMessage || "Failed to send link request due to an unexpected error." };
  }
};

// New function for students to remove their link with an admin
export const studentRemoveAdminLink = async (
  studentUserId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);
    
    // The student is only allowed to update their own profile to remove the link.
    const batch = writeBatch(firestore);
    batch.update(studentUserDocRef, {
      associatedAdminFirebaseId: null,
      associatedAdminUniqueId: null,
      linkRequestStatus: 'none', // Student explicitly removed the link
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return { success: true, message: 'Link with admin has been removed.' };
  } catch (error: any) {
    console.error("Error in studentRemoveAdminLink:", error);
    return { success: false, message: error.message || "Failed to remove link." };
  }
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
    // associatedAdminUniqueId should already be on the requestData and thus on student from initial request.
    studentUpdateData.associatedAdminUniqueId = requestData.adminUniqueIdTargeted;
  } else { // 'rejected' or any other non-accepted status
    studentUpdateData.associatedAdminFirebaseId = null;
    studentUpdateData.associatedAdminUniqueId = null;
    // If specifically rejected, mark status as 'rejected'. If other non-accepted logic, might be 'none' or keep as is.
    // For explicit reject by admin, 'rejected' is appropriate on the student profile.
    // If student cancels, it becomes 'none'.
    studentUpdateData.linkRequestStatus = 'rejected'; // Ensure student profile reflects admin's rejection.
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

export const updateUserProfileDocument = async (userId: string, data: Partial<UserProfile>): Promise<{ success: boolean, message?: string }> => {
  if (!userId) return { success: false, message: 'User ID is required.'};
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  try {
    // Ensure updatedAt is always set with serverTimestamp for consistency
    const updateData = { ...data, updatedAt: serverTimestamp() };
    await setDoc(userDocRef, updateData, { merge: true });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user profile document:", error);
    return { success: false, message: error.message || "Failed to update profile." };
  }
};
