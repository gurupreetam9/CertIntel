// NO 'use client'; directive
import { adminFirestore } from '@/lib/firebase/adminConfig'; // Use Admin SDK
import type { UserProfile, AdminProfile, UserRole, StudentLinkRequest } from '@/lib/models/user';
// Import Timestamp and FieldValue from firebase-admin/firestore
import { Timestamp, FieldValue } from 'firebase-admin/firestore'; // Correct import for Admin SDK
import { v4 as uuidv4 } from 'uuid';

const USERS_COLLECTION = 'users';
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';


// SERVER-SIDE function for creating/updating user profile, used by registration flow
export const createUserProfileDocument_SERVER = async (
  userId: string,
  email: string,
  role: UserRole,
  additionalData: Partial<UserProfile> = {}
): Promise<UserProfile> => {
  const userDocRef = adminFirestore.collection(USERS_COLLECTION).doc(userId); // Admin SDK: adminFirestore.collection().doc()
  const now = Timestamp.now();
  console.log(`[SERVICE_SERVER/createUserProfileDocument_SERVER] - START. Target UID: ${userId}. Role: ${role}. AdditionalData:`, JSON.stringify(additionalData));

  let initialLinkStatus: UserProfile['linkRequestStatus'] = 'none';
  let associatedAdminFirebaseIdToSet: string | null = null;
  let associatedAdminUniqueIdToSet: string | null = null;

  if (role === 'student' && additionalData.associatedAdminUniqueId) {
    const adminProfileFromUniqueId = await getAdminByUniqueId_SERVER(additionalData.associatedAdminUniqueId);
    if (adminProfileFromUniqueId) {
      initialLinkStatus = 'pending';
      associatedAdminFirebaseIdToSet = adminProfileFromUniqueId.userId;
      associatedAdminUniqueIdToSet = additionalData.associatedAdminUniqueId;
      console.log(`[SERVICE_SERVER/createUserProfileDocument_SERVER] - Student linking to Admin ID: ${additionalData.associatedAdminUniqueId} (Firebase UID: ${adminProfileFromUniqueId.userId}). Status set to 'pending'.`);
    } else {
      console.warn(`[SERVICE_SERVER/createUserProfileDocument_SERVER] - Student provided Admin ID ${additionalData.associatedAdminUniqueId} but no matching admin found. Link not initiated.`);
    }
  }

  const profileData: UserProfile = {
    uid: userId,
    email,
    role,
    displayName: additionalData.displayName || email.split('@')[0] || userId,
    createdAt: now,
    updatedAt: now,
    rollNo: (role === 'student' && additionalData.rollNo) ? additionalData.rollNo : undefined,
    linkRequestStatus: (role === 'student') ? initialLinkStatus : undefined,
    associatedAdminFirebaseId: (role === 'student') ? associatedAdminFirebaseIdToSet : undefined,
    associatedAdminUniqueId: (role === 'student') ? associatedAdminUniqueIdToSet : undefined,
    adminUniqueId: (role === 'admin' && additionalData.adminUniqueId) ? additionalData.adminUniqueId : undefined,
  };

  const finalProfileData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined)
  ) as UserProfile;

  await userDocRef.set(finalProfileData); // Admin SDK: docRef.set()
  console.log(`[SERVICE_SERVER/createUserProfileDocument_SERVER] - END. Profile doc created/set for UID: ${userId}. Final data written:`, JSON.stringify(finalProfileData));

  if (role === 'student' && initialLinkStatus === 'pending' && associatedAdminFirebaseIdToSet && associatedAdminUniqueIdToSet) {
    await createStudentLinkRequest_SERVER(
      userId,
      email,
      finalProfileData.displayName!,
      finalProfileData.rollNo || null,
      associatedAdminUniqueIdToSet,
      associatedAdminFirebaseIdToSet
    );
  }

  return finalProfileData;
};

// SERVER-SIDE function for admin profile specific tasks during registration
export const createAdminProfile_SERVER = async (userId: string, email: string): Promise<AdminProfile> => {
  const adminUniqueId = uuidv4().substring(0, 8).toUpperCase();
  const now = Timestamp.now();
  console.log(`[SERVICE_SERVER/createAdminProfile_SERVER] - START. Target UID: ${userId}. Email: ${email}. Generated AdminUniqueId: ${adminUniqueId}`);

  await createUserProfileDocument_SERVER(userId, email, 'admin', { adminUniqueId });
  console.log(`[SERVICE_SERVER/createAdminProfile_SERVER] - END. Admin profile entry created in 'users' collection for UID: ${userId}. AdminUniqueId: ${adminUniqueId}`);

  return {
    userId,
    adminUniqueId,
    email,
    createdAt: now,
  };
};

// SERVER-SIDE function to get admin details by their unique shareable ID
export const getAdminByUniqueId_SERVER = async (adminUniqueId: string): Promise<{ userId: string; email: string; adminUniqueId: string; displayName?: string | null } | null> => {
  console.log(`[SERVICE_SERVER/getAdminByUniqueId_SERVER] - Querying USERS_COLLECTION for adminUniqueId: ${adminUniqueId}`);
  // Admin SDK: adminFirestore.collection().where().where().limit().get()
  const usersQuery = adminFirestore.collection(USERS_COLLECTION)
    .where('role', '==', 'admin')
    .where('adminUniqueId', '==', adminUniqueId)
    .limit(1);

  try {
    const querySnapshot = await usersQuery.get(); // Admin SDK: query.get()
    if (!querySnapshot.empty) {
      const adminUserProfile = querySnapshot.docs[0].data() as UserProfile;
      console.log(`[SERVICE_SERVER/getAdminByUniqueId_SERVER] - Found admin user profile:`, adminUserProfile);
      return {
        userId: adminUserProfile.uid,
        adminUniqueId: adminUserProfile.adminUniqueId!,
        email: adminUserProfile.email!,
        displayName: adminUserProfile.displayName,
      };
    }
    console.log(`[SERVICE_SERVER/getAdminByUniqueId_SERVER] - No admin found with adminUniqueId: ${adminUniqueId}`);
    return null;
  } catch (error: any) {
    console.error(`[SERVICE_SERVER/getAdminByUniqueId_SERVER] - Error querying for adminUniqueId ${adminUniqueId}:`, error);
    throw error;
  }
};

// SERVER-SIDE function to create the actual student link request document
export const createStudentLinkRequest_SERVER = async (
  studentUserId: string,
  studentEmail: string,
  studentName: string,
  studentRollNo: string | null,
  targetAdminUniqueId: string,
  targetAdminFirebaseId: string
): Promise<StudentLinkRequest> => {
  const requestDocRef = adminFirestore.collection(STUDENT_LINK_REQUESTS_COLLECTION).doc(); // Admin SDK: create doc ref
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

  console.log(`[SERVICE_SERVER/createStudentLinkRequest_SERVER] - Creating link request document for StudentUID: ${studentUserId}, TargetAdminUID: ${targetAdminFirebaseId}`);
  try {
    await requestDocRef.set(linkRequest); // Admin SDK: docRef.set()
    console.log(`%c[SERVICE_SERVER/createStudentLinkRequest_SERVER] - SUCCESS. Link request document created. RequestID: ${linkRequest.id}`, "color: green; font-weight: bold;");
    return linkRequest;
  } catch (error: any) {
      console.error(`%c[SERVICE_SERVER/createStudentLinkRequest_SERVER] - !!! SET DOC FAILED for link request !!! StudentUID: ${studentUserId}, Admin: ${targetAdminUniqueId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, "color: red; font-weight: bold;", error);
      throw error;
  }
};
