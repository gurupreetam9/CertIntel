
'use client';
import { auth as firebaseAuthClient, firestore } from '@/lib/firebase/config'; 
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
} from 'firebase/firestore'; 
import { v4 as uuidv4 } from 'uuid';

const USERS_COLLECTION = 'users';
const ADMINS_COLLECTION = 'admins'; 
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';


export const createUserProfileDocument = async (
  userId: string,
  email: string,
  role: UserRole,
  additionalData: Partial<UserProfile> = {}
): Promise<UserProfile> => {
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  const now = Timestamp.now();
  const clientAuthUid = firebaseAuthClient.currentUser?.uid;
  console.log(`[SERVICE/createUserProfileDocument] - START. Target UID: ${userId}. ClientAuthUID (SDK): ${clientAuthUid}. Role: ${role}. AdditionalData:`, JSON.stringify(additionalData));
  
  if (clientAuthUid !== userId && role !== 'admin') { 
    console.warn(`[SERVICE/createUserProfileDocument] - MISMATCH/NULL ClientAuthUID: '${clientAuthUid}' vs target UID: '${userId}' for non-admin role. This is a concern if purely client-driven for own profile.`);
  }

  const profileData: UserProfile = {
    uid: userId,
    email,
    role,
    displayName: additionalData.displayName || email.split('@')[0] || userId,
    createdAt: now,
    updatedAt: now,
    rollNo: (role === 'student' && additionalData.rollNo) ? additionalData.rollNo : undefined,
    linkRequestStatus: (role === 'student') ? 'none' : undefined,
    associatedAdminFirebaseId: (role === 'student') ? null : undefined, 
    associatedAdminUniqueId: (role === 'student') ? null : undefined, 
    adminUniqueId: (role === 'admin' && additionalData.adminUniqueId) ? additionalData.adminUniqueId : undefined,
  };

  const finalProfileData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined)
  ) as UserProfile;

  await setDoc(userDocRef, finalProfileData);
  console.log(`[SERVICE/createUserProfileDocument] - END. Profile doc created/set for UID: ${userId}. Final data written:`, JSON.stringify(finalProfileData));
  return finalProfileData;
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) {
    console.warn("[SERVICE/getUserProfile (client-sdk)] - Called with no userId.");
    return null;
  }
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  try {
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserProfile;
    }
    console.log(`[SERVICE/getUserProfile (client-sdk)] - No profile found for userId ${userId}.`);
    return null;
  } catch (error: any) {
     console.error(`[SERVICE/getUserProfile (client-sdk)] - Error fetching profile for userId ${userId}: ${error.message}`, error);
     return null;
  }
};

export const createAdminProfile = async (userId: string, email: string): Promise<AdminProfile> => {
  const adminDocRef = doc(firestore, ADMINS_COLLECTION, userId); 
  const adminUniqueId = uuidv4().substring(0, 8).toUpperCase();
  const now = Timestamp.now();

  const adminDataForAdminsCollection: AdminProfile = { 
    userId,
    adminUniqueId,
    email,
    createdAt: now,
  };
  await setDoc(adminDocRef, adminDataForAdminsCollection);
  
  await createUserProfileDocument(userId, email, 'admin', { adminUniqueId });
  
  return adminDataForAdminsCollection; 
};

export const getAdminByUniqueId = async (adminUniqueId: string): Promise<AdminProfile | null> => {
  console.log(`[SERVICE/getAdminByUniqueId] - Querying USERS_COLLECTION for adminUniqueId: ${adminUniqueId}`);
  const usersQuery = query(
    collection(firestore, USERS_COLLECTION), 
    where('role', '==', 'admin'),
    where('adminUniqueId', '==', adminUniqueId), 
    limit(1)
  );
  
  try {
    const querySnapshot = await getDocs(usersQuery);
    if (!querySnapshot.empty) {
      const adminUserProfile = querySnapshot.docs[0].data() as UserProfile;
      console.log(`[SERVICE/getAdminByUniqueId] - Found admin user profile:`, adminUserProfile);
      return {
        userId: adminUserProfile.uid,
        adminUniqueId: adminUserProfile.adminUniqueId!, 
        email: adminUserProfile.email!, 
        createdAt: adminUserProfile.createdAt, 
      };
    }
    console.log(`[SERVICE/getAdminByUniqueId] - No admin found in USERS_COLLECTION with adminUniqueId: ${adminUniqueId}`);
    return null;
  } catch (error: any) {
    console.error(`[SERVICE/getAdminByUniqueId] - Error querying USERS_COLLECTION for adminUniqueId ${adminUniqueId}:`, error);
    throw error; 
  }
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

  const clientAuthUidForBatch = firebaseAuthClient.currentUser?.uid;
  console.log(`%c[SERVICE/createStudentLinkRequest] (BATCH PREP) - StudentUID_Param: ${studentUserId}, ClientAuthUID (SDK): ${clientAuthUidForBatch}. TargetAdminUID: ${targetAdminFirebaseId}, TargetAdminUniqueId: ${targetAdminUniqueId}`, "color: orange; font-weight: bold;");
  if (clientAuthUidForBatch !== studentUserId) {
    console.warn(`[SERVICE/createStudentLinkRequest] (BATCH PREP) - WARNING: MISMATCH/NULL ClientAuthUID: '${clientAuthUidForBatch}' vs StudentUID_Param: '${studentUserId}'. This is a high risk for Firestore permission errors if rules expect them to match for student-initiated actions.`);
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
  
  console.log(`[SERVICE/createStudentLinkRequest] (BATCH COMMIT) - ABOUT TO COMMIT. StudentUID: ${studentUserId}, AdminUniqueId: ${targetAdminUniqueId}. ClientAuthUID (SDK): ${clientAuthUidForBatch}`);
  try {
    await batch.commit();
    console.log(`%c[SERVICE/createStudentLinkRequest] (BATCH COMMIT) - SUCCESS. Committed for StudentUID: ${studentUserId}. RequestID: ${linkRequest.id}`, "color: green; font-weight: bold;");
    return linkRequest;
  } catch (error: any) {
      console.error(`%c[SERVICE/createStudentLinkRequest] (BATCH COMMIT) - !!! BATCH COMMIT FAILED !!! StudentUID: ${studentUserId}, Admin: ${targetAdminUniqueId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, "color: red; font-weight: bold;", error);
      throw error; 
  }
};

export const studentRequestLinkWithAdmin = async (
  studentUserId: string, 
  studentEmail: string,
  studentName: string,
  studentRollNo: string | null,
  targetAdminUniqueId: string
): Promise<{ success: boolean; message: string; requestId?: string }> => {
  const clientAuthUid = firebaseAuthClient.currentUser?.uid; 
  console.log(`%c[SERVICE/studentRequestLinkWithAdmin] - Function ENTRY. StudentUID_Param: ${studentUserId}, ClientAuthUID (SDK): ${clientAuthUid}, TargetAdminUniqueId: ${targetAdminUniqueId}`, "color: green; font-weight: bold; font-size: 1.2em;");

  if (!studentUserId) {
    console.error("[SERVICE/studentRequestLinkWithAdmin] - CRITICAL PRE-CHECK: studentUserId parameter is missing or falsy.");
    return { success: false, message: "Internal error: Student identifier missing." };
  }
  if (!firebaseAuthClient.currentUser) {
      console.error("[SERVICE/studentRequestLinkWithAdmin] - CRITICAL PRE-CHECK: Firebase SDK (firebaseAuthClient.currentUser) reports NO USER LOGGED IN at service function call.");
      return { success: false, message: "Authentication error: No user is currently signed in according to Firebase SDK. Please re-login." };
  }
  if (clientAuthUid !== studentUserId) {
    console.error(`[SERVICE/studentRequestLinkWithAdmin] - CRITICAL AUTH MISMATCH: The studentUserId parameter ('${studentUserId}') does NOT match the client-side SDK's authenticated user UID ('${clientAuthUid}'). This will lead to permission errors if rules rely on request.auth.uid matching the student's own ID for writes.`);
    return { success: false, message: `Authentication mismatch. Provided student ID (${studentUserId}) does not match current logged-in user (${clientAuthUid}). Please re-login or contact support.` };
  }
  
  const studentRollNoCleaned = (studentRollNo && studentRollNo.trim() !== '') ? studentRollNo.trim() : null;

  try {
    console.log(`[SERVICE/studentRequestLinkWithAdmin] - STEP: Calling getAdminByUniqueId for TargetAdminUniqueId: ${targetAdminUniqueId}`);
    const adminProfile = await getAdminByUniqueId(targetAdminUniqueId);
    console.log(`[SERVICE/studentRequestLinkWithAdmin] - STEP: getAdminByUniqueId result:`, adminProfile ? JSON.parse(JSON.stringify(adminProfile)) : "null");

    if (!adminProfile) {
      console.warn(`[SERVICE/studentRequestLinkWithAdmin] - No admin found for unique ID: ${targetAdminUniqueId}`);
      return { success: false, message: `No Teacher/Admin found with ID: ${targetAdminUniqueId}. Please check the ID and try again.` };
    }
    console.log(`[SERVICE/studentRequestLinkWithAdmin] - Found admin profile for ID ${targetAdminUniqueId}: Admin Firebase UID is ${adminProfile.userId}`);

    console.log(`[SERVICE/studentRequestLinkWithAdmin] - STEP: Checking existing requests for StudentUID: ${studentUserId}, AdminFirebaseUID: ${adminProfile.userId}`);
    const existingRequestQuery = query(
      collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
      where('studentUserId', '==', studentUserId),
      where('adminFirebaseId', '==', adminProfile.userId),
      where('status', 'in', ['pending', 'accepted'])
    );
    const existingRequestSnap = await getDocs(existingRequestQuery);
    console.log(`[SERVICE/studentRequestLinkWithAdmin] - STEP: getDocs for existing requests result: empty = ${existingRequestSnap.empty}, size = ${existingRequestSnap.size}`);

    if (!existingRequestSnap.empty) {
        const existingStatus = existingRequestSnap.docs[0].data().status;
        console.warn(`[SERVICE/studentRequestLinkWithAdmin] - Student ${studentUserId} already has an existing request with admin ${targetAdminUniqueId} (Admin Firebase ID: ${adminProfile.userId}) with status: ${existingStatus}`);
        if (existingStatus === 'pending') {
            return { success: false, message: `You already have a pending request with Admin ID ${targetAdminUniqueId}.` };
        } else if (existingStatus === 'accepted') {
            return { success: false, message: `You are already linked with Admin ID ${targetAdminUniqueId}.` };
        }
    }

    console.log(`[SERVICE/studentRequestLinkWithAdmin] - STEP: Calling createStudentLinkRequest. StudentUID: ${studentUserId}, StudentEmail: ${studentEmail}, StudentName: ${studentName}, StudentRollNo: ${studentRollNoCleaned}, TargetAdminUniqueId: ${targetAdminUniqueId}, AdminFirebaseUID: ${adminProfile.userId}`);
    const linkRequest = await createStudentLinkRequest(
      studentUserId,
      studentEmail,
      studentName,
      studentRollNoCleaned,
      targetAdminUniqueId,
      adminProfile.userId
    );
    console.log(`[SERVICE/studentRequestLinkWithAdmin] - Link request successfully created by createStudentLinkRequest. Request ID: ${linkRequest.id}`);
    return { success: true, message: 'Link request sent successfully.', requestId: linkRequest.id };

  } catch (error: any) {
    console.error(`%c[SERVICE/studentRequestLinkWithAdmin] - !!! OUTER CATCH BLOCK ERROR !!! StudentUID: ${studentUserId}, AdminUniqueId: ${targetAdminUniqueId}. Error Name: ${error.name}, Code: ${error.code}, Message: ${error.message}. Full Error Object:`, "color: red; font-weight: bold;", JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))));
    const errorMessage = error.code ? `Firestore error (${error.code}): ${error.message}` : error.message;
    return { success: false, message: errorMessage || "Failed to send link request due to an unexpected error." };
  }
};

export const studentRemoveAdminLink = async (
  studentUserId: string
): Promise<{ success: boolean; message: string }> => {
  const clientAuthUid = firebaseAuthClient.currentUser?.uid;
  console.log(`%c[SERVICE/studentRemoveAdminLink] - Function ENTRY. StudentUID_Param: ${studentUserId}, ClientAuthUID (SDK): ${clientAuthUid}`, "color: #FF8C00; font-weight: bold;"); // Orange color for remove link

  if (!studentUserId || clientAuthUid !== studentUserId) {
    console.error(`[SERVICE/studentRemoveAdminLink] - Auth MISMATCH or missing studentUserId. Param: '${studentUserId}', SDK UID: '${clientAuthUid}'`);
    return { success: false, message: "Authentication error or mismatch. Cannot remove link." };
  }

  const batch = writeBatch(firestore);
  const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);

  try {
    console.log(`[SERVICE/studentRemoveAdminLink] - Fetching student profile for ${studentUserId} to identify linked admin.`);
    const studentProfileSnap = await getDoc(studentUserDocRef);
    if (!studentProfileSnap.exists()) {
      console.error(`[SERVICE/studentRemoveAdminLink] - Student profile not found for UID: ${studentUserId}. Cannot proceed with link removal.`);
      return { success: false, message: "Student profile not found. Cannot remove link." };
    }
    const studentProfileData = studentProfileSnap.data() as UserProfile;
    const linkedAdminFirebaseId = studentProfileData.associatedAdminFirebaseId;

    console.log(`[SERVICE/studentRemoveAdminLink] - Student profile fetched. Linked Admin Firebase ID: ${linkedAdminFirebaseId || 'None'}`);

    // Update student's profile
    batch.update(studentUserDocRef, {
      associatedAdminFirebaseId: null,
      associatedAdminUniqueId: null,
      linkRequestStatus: 'none',
      updatedAt: serverTimestamp(),
    });
    console.log(`[SERVICE/studentRemoveAdminLink] - Added update to student's profile in batch for UID: ${studentUserId}.`);

    if (linkedAdminFirebaseId) {
      console.log(`[SERVICE/studentRemoveAdminLink] - Student was linked to admin ${linkedAdminFirebaseId}. Querying studentLinkRequests to cancel.`);
      const requestsQuery = query(
        collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
        where('studentUserId', '==', studentUserId),
        where('adminFirebaseId', '==', linkedAdminFirebaseId),
        where('status', 'in', ['pending', 'accepted'])
      );

      const requestsSnapshot = await getDocs(requestsQuery);
      if (!requestsSnapshot.empty) {
        requestsSnapshot.forEach(requestDoc => {
          console.log(`[SERVICE/studentRemoveAdminLink] - Found request ${requestDoc.id} (status: ${requestDoc.data().status}). Adding update to 'cancelled' in batch.`);
          batch.update(requestDoc.ref, {
            status: 'cancelled', // Or 'revoked_by_student'
            updatedAt: serverTimestamp(),
          });
        });
      } else {
        console.log(`[SERVICE/studentRemoveAdminLink] - No 'pending' or 'accepted' requests found in studentLinkRequests for student ${studentUserId} and admin ${linkedAdminFirebaseId}.`);
      }
    } else {
      console.log(`[SERVICE/studentRemoveAdminLink] - Student was not linked to any admin (associatedAdminFirebaseId was null). Skipping query for studentLinkRequests.`);
    }

    console.log(`[SERVICE/studentRemoveAdminLink] - About to commit batch for student UID: ${studentUserId}.`);
    await batch.commit();
    console.log(`%c[SERVICE/studentRemoveAdminLink] - SUCCESS. Link removed and relevant requests cancelled for StudentUID: ${studentUserId}`, "color: green; font-weight: bold;");
    return { success: true, message: 'Link with admin has been removed and associated requests updated.' };

  } catch (error: any) {
    console.error(`%c[SERVICE/studentRemoveAdminLink] - !!! BATCH COMMIT FAILED or error during process !!! StudentUID: ${studentUserId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, "color: red; font-weight: bold;", error);
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
    studentUpdateData.associatedAdminUniqueId = requestData.adminUniqueIdTargeted;
  } else { 
    studentUpdateData.associatedAdminFirebaseId = null;
    studentUpdateData.associatedAdminUniqueId = null;
    studentUpdateData.linkRequestStatus = 'rejected'; 
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
    const updateData = { ...data, updatedAt: serverTimestamp() };
    const cleanUpdateData = Object.fromEntries(Object.entries(updateData).filter(([_, v]) => v !== undefined));
    await setDoc(userDocRef, cleanUpdateData, { merge: true });
    return { success: true };
  } catch (error: any) {
    console.error("[SERVICE/updateUserProfileDocument] - Error updating user profile document:", error);
    return { success: false, message: error.message || "Failed to update profile." };
  }
};

    
