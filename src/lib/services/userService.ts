
// src/lib/services/userService.ts
'use client'; // This file is for client-side Firebase interactions
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
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
// import { v4 as uuidv4 } from 'uuid'; // uuid is for server-side unique ID generation
import { sendEmail } from '@/lib/emailUtils';

const USERS_COLLECTION = 'users';
// const ADMINS_COLLECTION = 'admins'; // Admin specific list might be managed by server or not needed if users collection is source of truth
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';


// CLIENT-SIDE: Fetches a user profile using the client SDK.
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) {
    console.warn("[SERVICE_CLIENT/getUserProfile] - Called with no userId.");
    return null;
  }
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  try {
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserProfile;
    }
    console.log(`[SERVICE_CLIENT/getUserProfile] - No profile found for userId ${userId}.`);
    return null;
  } catch (error: any) {
     console.error(`[SERVICE_CLIENT/getUserProfile] - Error fetching profile for userId ${userId}: ${error.message}`, error);
     return null;
  }
};

// CLIENT-SIDE: Gets admin details by their unique shareable ID (queries 'users' collection)
export const getAdminByUniqueId = async (adminUniqueId: string): Promise<AdminProfile | null> => {
  console.log(`[SERVICE_CLIENT/getAdminByUniqueId] - Querying USERS_COLLECTION for adminUniqueId: ${adminUniqueId}`);
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
      console.log(`[SERVICE_CLIENT/getAdminByUniqueId] - Found admin user profile:`, adminUserProfile);
      // Construct AdminProfile-like object from UserProfile
      return {
        userId: adminUserProfile.uid,
        adminUniqueId: adminUserProfile.adminUniqueId!,
        email: adminUserProfile.email!,
        createdAt: adminUserProfile.createdAt, // Assuming UserProfile has createdAt
      };
    }
    console.log(`[SERVICE_CLIENT/getAdminByUniqueId] - No admin found in USERS_COLLECTION with adminUniqueId: ${adminUniqueId}`);
    return null;
  } catch (error: any) {
    console.error(`[SERVICE_CLIENT/getAdminByUniqueId] - Error querying USERS_COLLECTION for adminUniqueId ${adminUniqueId}:`, error);
    throw error;
  }
};

// CLIENT-SIDE: Creates the student link request document AND updates student's profile in a batch
// This function is called from student's profile settings.
const createStudentLinkRequest_CLIENT = async (
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
  console.log(`%c[SERVICE_CLIENT/createStudentLinkRequest_CLIENT] (BATCH PREP) - StudentUID_Param: ${studentUserId}, ClientAuthUID (SDK): ${clientAuthUidForBatch}. TargetAdminUID: ${targetAdminFirebaseId}, TargetAdminUniqueId: ${targetAdminUniqueId}`, "color: orange; font-weight: bold;");
  if (clientAuthUidForBatch !== studentUserId) {
    console.warn(`[SERVICE_CLIENT/createStudentLinkRequest_CLIENT] (BATCH PREP) - WARNING: MISMATCH/NULL ClientAuthUID: '${clientAuthUidForBatch}' vs StudentUID_Param: '${studentUserId}'. This is a high risk for Firestore permission errors.`);
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

  console.log(`[SERVICE_CLIENT/createStudentLinkRequest_CLIENT] (BATCH COMMIT) - ABOUT TO COMMIT. StudentUID: ${studentUserId}, AdminUniqueId: ${targetAdminUniqueId}. ClientAuthUID (SDK): ${clientAuthUidForBatch}`);
  try {
    await batch.commit();
    console.log(`%c[SERVICE_CLIENT/createStudentLinkRequest_CLIENT] (BATCH COMMIT) - SUCCESS. Committed for StudentUID: ${studentUserId}. RequestID: ${linkRequest.id}`, "color: green; font-weight: bold;");
    return linkRequest;
  } catch (error: any) {
      console.error(`%c[SERVICE_CLIENT/createStudentLinkRequest_CLIENT] (BATCH COMMIT) - !!! BATCH COMMIT FAILED !!! StudentUID: ${studentUserId}, Admin: ${targetAdminUniqueId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, "color: red; font-weight: bold;", error);
      throw error;
  }
};


// CLIENT-SIDE: Called from student's profile settings to initiate a link with an admin
export const studentRequestLinkWithAdmin = async (
  studentUserId: string,
  studentEmail: string,
  studentName: string,
  studentRollNo: string | null,
  targetAdminUniqueId: string
): Promise<{ success: boolean; message: string; requestId?: string }> => {
  const clientAuthUid = firebaseAuthClient.currentUser?.uid;
  console.log(`%c[SERVICE_CLIENT/studentRequestLinkWithAdmin] - Function ENTRY. StudentUID_Param: ${studentUserId}, ClientAuthUID (SDK): ${clientAuthUid}, TargetAdminUniqueId: ${targetAdminUniqueId}`, "color: green; font-weight: bold; font-size: 1.2em;");

  if (!studentUserId) {
    console.error("[SERVICE_CLIENT/studentRequestLinkWithAdmin] - CRITICAL PRE-CHECK: studentUserId parameter is missing or falsy.");
    return { success: false, message: "Internal error: Student identifier missing." };
  }
  if (!firebaseAuthClient.currentUser) {
      console.error("[SERVICE_CLIENT/studentRequestLinkWithAdmin] - CRITICAL PRE-CHECK: Firebase SDK (firebaseAuthClient.currentUser) reports NO USER LOGGED IN.");
      return { success: false, message: "Authentication error: No user is currently signed in. Please re-login." };
  }
  if (clientAuthUid !== studentUserId) {
    console.error(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - CRITICAL AUTH MISMATCH: StudentUserId_Param ('${studentUserId}') != client SDK UID ('${clientAuthUid}').`);
    return { success: false, message: `Authentication mismatch. Provided student ID (${studentUserId}) does not match current logged-in user (${clientAuthUid}).` };
  }

  const studentRollNoCleaned = (studentRollNo && studentRollNo.trim() !== '') ? studentRollNo.trim() : null;

  try {
    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - STEP: Calling getAdminByUniqueId for TargetAdminUniqueId: ${targetAdminUniqueId}`);
    const adminProfile = await getAdminByUniqueId(targetAdminUniqueId); // Uses client-side getAdminByUniqueId
    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - STEP: getAdminByUniqueId result:`, adminProfile ? JSON.parse(JSON.stringify(adminProfile)) : "null");

    if (!adminProfile) {
      console.warn(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - No admin found for unique ID: ${targetAdminUniqueId}`);
      return { success: false, message: `No Teacher/Admin found with ID: ${targetAdminUniqueId}. Please check the ID.` };
    }
    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - Found admin profile for ID ${targetAdminUniqueId}: Admin Firebase UID is ${adminProfile.userId}`);

    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - STEP: Checking existing requests for StudentUID: ${studentUserId}, AdminFirebaseUID: ${adminProfile.userId}`);
    const existingRequestQuery = query(
      collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
      where('studentUserId', '==', studentUserId),
      where('adminFirebaseId', '==', adminProfile.userId),
      where('status', 'in', ['pending', 'accepted'])
    );
    const existingRequestSnap = await getDocs(existingRequestQuery);
    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - STEP: getDocs for existing requests result: empty = ${existingRequestSnap.empty}, size = ${existingRequestSnap.size}`);

    if (!existingRequestSnap.empty) {
        const existingStatus = existingRequestSnap.docs[0].data().status;
        console.warn(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - Student ${studentUserId} already has an existing request with admin ${targetAdminUniqueId} (Admin Firebase ID: ${adminProfile.userId}) with status: ${existingStatus}`);
        if (existingStatus === 'pending') {
            return { success: false, message: `You already have a pending request with Admin ID ${targetAdminUniqueId}.` };
        } else if (existingStatus === 'accepted') {
            return { success: false, message: `You are already linked with Admin ID ${targetAdminUniqueId}.` };
        }
    }

    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - STEP: Calling createStudentLinkRequest_CLIENT. StudentUID: ${studentUserId}, StudentEmail: ${studentEmail}, StudentName: ${studentName}, StudentRollNo: ${studentRollNoCleaned}, TargetAdminUniqueId: ${targetAdminUniqueId}, AdminFirebaseUID: ${adminProfile.userId}`);
    const linkRequest = await createStudentLinkRequest_CLIENT( // Call client version
      studentUserId,
      studentEmail,
      studentName,
      studentRollNoCleaned,
      targetAdminUniqueId,
      adminProfile.userId
    );
    console.log(`[SERVICE_CLIENT/studentRequestLinkWithAdmin] - Link request successfully created. Request ID: ${linkRequest.id}`);
    return { success: true, message: 'Link request sent successfully.', requestId: linkRequest.id };

  } catch (error: any) {
    console.error(`%c[SERVICE_CLIENT/studentRequestLinkWithAdmin] - !!! OUTER CATCH BLOCK ERROR !!! StudentUID: ${studentUserId}, AdminUniqueId: ${targetAdminUniqueId}. Error Name: ${error.name}, Code: ${error.code}, Message: ${error.message}. Full Error Object:`, "color: red; font-weight: bold;", JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))));
    const errorMessage = error.code ? `Firestore error (${error.code}): ${error.message}` : error.message;
    return { success: false, message: errorMessage || "Failed to send link request." };
  }
};

// CLIENT-SIDE: Called from student's profile settings to remove a link
export const studentRemoveAdminLink = async (
  studentUserId: string
): Promise<{ success: boolean; message: string }> => {
  const clientAuthUid = firebaseAuthClient.currentUser?.uid;
  console.log(`%c[SERVICE_CLIENT/studentRemoveAdminLink] - Function ENTRY. StudentUID_Param: ${studentUserId}, ClientAuthUID (SDK): ${clientAuthUid}`, "color: #FF8C00; font-weight: bold;");

  if (!studentUserId || clientAuthUid !== studentUserId) {
    console.error(`[SERVICE_CLIENT/studentRemoveAdminLink] - Auth MISMATCH or missing studentUserId. Param: '${studentUserId}', SDK UID: '${clientAuthUid}'`);
    return { success: false, message: "Authentication error or mismatch. Cannot remove link." };
  }

  const batch = writeBatch(firestore);
  const studentUserDocRef = doc(firestore, USERS_COLLECTION, studentUserId);

  try {
    console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Fetching student profile for ${studentUserId}.`);
    const studentProfileSnap = await getDoc(studentUserDocRef);
    if (!studentProfileSnap.exists()) {
      console.error(`[SERVICE_CLIENT/studentRemoveAdminLink] - Student profile not found for UID: ${studentUserId}.`);
      return { success: false, message: "Student profile not found." };
    }
    const studentProfileData = studentProfileSnap.data() as UserProfile;
    const linkedAdminFirebaseId = studentProfileData.associatedAdminFirebaseId;

    console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Student profile fetched. Linked Admin Firebase ID: ${linkedAdminFirebaseId || 'None'}`);

    batch.update(studentUserDocRef, {
      associatedAdminFirebaseId: null,
      associatedAdminUniqueId: null,
      linkRequestStatus: 'none',
      updatedAt: serverTimestamp(),
    });
    console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Added update to student's profile in batch for UID: ${studentUserId}.`);

    if (linkedAdminFirebaseId) {
      console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Student was linked to admin ${linkedAdminFirebaseId}. Querying to update requests to 'cancelled'.`);
      const requestsQuery = query(
        collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
        where('studentUserId', '==', studentUserId),
        where('adminFirebaseId', '==', linkedAdminFirebaseId),
        where('status', 'in', ['pending', 'accepted'])
      );
      const requestsSnapshot = await getDocs(requestsQuery);
      if (!requestsSnapshot.empty) {
        requestsSnapshot.forEach(requestDoc => {
          console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Found request ${requestDoc.id} (status: ${requestDoc.data().status}). Updating to 'cancelled'.`);
          batch.update(requestDoc.ref, {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
            resolvedAt: serverTimestamp(),
            resolvedBy: studentUserId,
          });
        });
      }
    } else {
      console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Student not actively linked. Checking for any orphaned 'pending' requests.`);
      const orphanedPendingQuery = query(
        collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
        where('studentUserId', '==', studentUserId),
        where('status', '==', 'pending')
      );
      const orphanedSnapshot = await getDocs(orphanedPendingQuery);
      if (!orphanedSnapshot.empty) {
        orphanedSnapshot.forEach(requestDoc => {
          console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - Found ORPHANED 'pending' request ${requestDoc.id}. Updating to 'cancelled'.`);
          batch.update(requestDoc.ref, {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
            resolvedAt: serverTimestamp(),
            resolvedBy: studentUserId,
          });
        });
      }
    }

    console.log(`[SERVICE_CLIENT/studentRemoveAdminLink] - About to commit batch for student UID: ${studentUserId}.`);
    await batch.commit();
    console.log(`%c[SERVICE_CLIENT/studentRemoveAdminLink] - SUCCESS. Link removed/requests updated for StudentUID: ${studentUserId}`, "color: green; font-weight: bold;");
    return { success: true, message: 'Link with admin removed.' };

  } catch (error: any) {
    console.error(`%c[SERVICE_CLIENT/studentRemoveAdminLink] - !!! BATCH COMMIT FAILED !!! StudentUID: ${studentUserId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, "color: red; font-weight: bold;", error);
    return { success: false, message: error.message || "Failed to remove link." };
  }
};

// CLIENT-SIDE: Real-time listener for pending requests for an admin
export const getStudentLinkRequestsForAdminRealtime = (
  adminFirebaseId: string,
  callback: (requests: StudentLinkRequest[]) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  console.log(`[SERVICE_CLIENT/getStudentLinkRequestsForAdminRealtime] Setting up listener for admin: ${adminFirebaseId}`);
  const q = query(
    collection(firestore, STUDENT_LINK_REQUESTS_COLLECTION),
    where('adminFirebaseId', '==', adminFirebaseId),
    where('status', '==', 'pending')
  );

  const unsubscribe = onSnapshot(q,
    (querySnapshot) => {
      const requests = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as StudentLinkRequest));
      console.log(`[SERVICE_CLIENT/getStudentLinkRequestsForAdminRealtime] Data received for admin ${adminFirebaseId}. Count: ${requests.length}`);
      callback(requests);
    },
    (error) => {
      console.error(`[SERVICE_CLIENT/getStudentLinkRequestsForAdminRealtime] Error for admin ${adminFirebaseId}:`, error);
      onError(error);
    }
  );
  return unsubscribe;
};

// CLIENT-SIDE: Admin action to resolve request status by calling the secure API endpoint
export const updateStudentLinkRequestStatusAndLinkStudent = async (
  requestId: string,
  adminFirebaseIdResolving: string,
  newStatus: Extract<LinkRequestStatus, 'accepted' | 'rejected'>
): Promise<void> => {
  const clientAuth = firebaseAuthClient.currentUser;
  if (!clientAuth) {
    throw new Error('Authentication Error: No user signed in.');
  }
  if (clientAuth.uid !== adminFirebaseIdResolving) {
    throw new Error('Authorization Error: You can only resolve your own requests.');
  }

  try {
    const idToken = await clientAuth.getIdToken();
    const response = await fetch('/api/admin/resolve-link-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ requestId, newStatus }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || `Failed to resolve request. Server responded with ${response.status}`);
    }
    console.log(`[SERVICE_CLIENT/updateStudentLinkRequestStatus] Successfully called API to resolve request ${requestId} to ${newStatus}.`);
  } catch (error: any) {
    console.error(`[SERVICE_CLIENT/updateStudentLinkRequestStatus] Error calling API to resolve request ${requestId}:`, error);
    throw error; // Re-throw the error to be caught by the calling component (e.g., to show a toast)
  }
};


// CLIENT-SIDE: Real-time listener for admin's accepted students
export const getStudentsForAdminRealtime = (
  adminFirebaseId: string,
  callback: (students: UserProfile[]) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  console.log(`[SERVICE_CLIENT/getStudentsForAdminRealtime] Setting up listener for admin: ${adminFirebaseId}'s accepted students.`);
  const q = query(
    collection(firestore, USERS_COLLECTION),
    where('role', '==', 'student'),
    where('associatedAdminFirebaseId', '==', adminFirebaseId),
    where('linkRequestStatus', '==', 'accepted')
  );

  const unsubscribe = onSnapshot(q,
    (querySnapshot) => {
      const students = querySnapshot.docs.map(docSnap => docSnap.data() as UserProfile);
      console.log(`[SERVICE_CLIENT/getStudentsForAdminRealtime] Data received for admin ${adminFirebaseId}'s accepted students. Count: ${students.length}`);
      callback(students);
    },
    (error) => {
      console.error(`[SERVICE_CLIENT/getStudentsForAdminRealtime] Error for admin ${adminFirebaseId}'s accepted students:`, error);
      onError(error);
    }
  );
  return unsubscribe;
};

// CLIENT-SIDE: Admin action to remove a linked student by calling the secure API endpoint
export const adminRemoveStudentLink = async (
  adminUserId: string,
  studentToRemoveId: string
): Promise<{ success: boolean; message: string }> => {
  const clientAuthUid = firebaseAuthClient.currentUser?.uid;
  console.log(`%c[SERVICE_CLIENT/adminRemoveStudentLink] - Function ENTRY. AdminUID_Param: ${adminUserId}, ClientAuthUID (SDK): ${clientAuthUid}, StudentToRemoveID: ${studentToRemoveId}`, "color: #FF8C00; font-weight: bold;");

  if (!adminUserId || clientAuthUid !== adminUserId) {
    console.error(`[SERVICE_CLIENT/adminRemoveStudentLink] - Auth MISMATCH or missing adminUserId. Param: '${adminUserId}', SDK UID: '${clientAuthUid}'`);
    return { success: false, message: "Authentication error or mismatch. Cannot remove link." };
  }
  
  if (!firebaseAuthClient.currentUser) {
    return { success: false, message: 'No authenticated user found.' };
  }

  try {
    const idToken = await firebaseAuthClient.currentUser.getIdToken();

    const response = await fetch('/api/admin/remove-student-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ studentToRemoveId }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to unlink student.');
    }

    console.log(`%c[SERVICE_CLIENT/adminRemoveStudentLink] - SUCCESS from API. Message: ${result.message}`, "color: green; font-weight: bold;");
    return { success: true, message: result.message };

  } catch (error: any) {
    console.error(`%c[SERVICE_CLIENT/adminRemoveStudentLink] - !!! API CALL FAILED !!! Admin: ${adminUserId}, Student: ${studentToRemoveId}. Error:`, "color: red; font-weight: bold;", error);
    return { success: false, message: error.message || "Failed to unlink student." };
  }
};


// CLIENT-SIDE: Updates user profile fields (like displayName, rollNo) using client SDK
export const updateUserProfileDocument = async (userId: string, data: Partial<UserProfile>): Promise<{ success: boolean, message?: string }> => {
  if (!userId) return { success: false, message: 'User ID is required.'};
  const userDocRef = doc(firestore, USERS_COLLECTION, userId);
  try {
    const updateData = { ...data, updatedAt: serverTimestamp() };
    const cleanUpdateData = Object.fromEntries(Object.entries(updateData).filter(([_, v]) => v !== undefined));
    await setDoc(userDocRef, cleanUpdateData, { merge: true });
    return { success: true };
  } catch (error: any) {
    console.error("[SERVICE_CLIENT/updateUserProfileDocument] - Error updating user profile document:", error);
    return { success: false, message: error.message || "Failed to update profile." };
  }
};
