
// NO 'use client'; directive
import { getAdminFirestore } from '@/lib/firebase/adminConfig'; // Use Admin SDK via getter
import type { UserProfile, AdminProfile, UserRole, StudentLinkRequest } from '@/lib/models/user';
import { Timestamp, FieldValue } from 'firebase-admin/firestore'; 
import { v4 as uuidv4 } from 'uuid';
import { connectToDb } from '@/lib/mongodb';
import type { UserImage } from '@/components/home/ImageGrid';


const USERS_COLLECTION = 'users';
const STUDENT_LINK_REQUESTS_COLLECTION = 'studentLinkRequests';

// SERVER-SIDE function for creating/updating user profile, used by registration flow
export const createUserProfileDocument_SERVER = async (
  userId: string,
  email: string,
  role: UserRole,
  additionalData: Partial<UserProfile> = {}
): Promise<UserProfile> => {
  const adminFirestore = getAdminFirestore(); // Get instance
  const userDocRef = adminFirestore.collection(USERS_COLLECTION).doc(userId);
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
    isPublicProfileEnabled: false, // Default public profile to false
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

  await userDocRef.set(finalProfileData);
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
  // const adminFirestore = getAdminFirestore(); // Not directly used here, createUserProfileDocument_SERVER will get it
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
  const adminFirestore = getAdminFirestore(); // Get instance
  console.log(`[SERVICE_SERVER/getAdminByUniqueId_SERVER] - Querying USERS_COLLECTION for adminUniqueId: ${adminUniqueId}`);
  const usersCollectionRef = adminFirestore.collection(USERS_COLLECTION);
  const usersQuery = usersCollectionRef
    .where('role', '==', 'admin')
    .where('adminUniqueId', '==', adminUniqueId)
    .limit(1);

  try {
    const querySnapshot = await usersQuery.get();
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
  const adminFirestore = getAdminFirestore(); // Get instance
  const requestDocRef = adminFirestore.collection(STUDENT_LINK_REQUESTS_COLLECTION).doc(); 
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
    await requestDocRef.set(linkRequest); 
    console.log(`%c[SERVICE_SERVER/createStudentLinkRequest_SERVER] - SUCCESS. Link request document created. RequestID: ${linkRequest.id}`, "color: green; font-weight: bold;");
    return linkRequest;
  } catch (error: any) {
      console.error(`%c[SERVICE_SERVER/createStudentLinkRequest_SERVER] - !!! SET DOC FAILED for link request !!! StudentUID: ${studentUserId}, Admin: ${targetAdminUniqueId}. Firestore Error Code: ${error.code}. Message: ${error.message}. Full Error:`, "color: red; font-weight: bold;", error);
      throw error;
  }
};

// NEW SERVER-SIDE function to fetch data for the public showcase profile
export const getPublicProfileData_SERVER = async (
  userId: string
): Promise<{ profile: UserProfile; images: UserImage[] } | { error: string; status: number }> => {
  const adminFirestore = getAdminFirestore();
  console.log(`[SERVICE_SERVER/getPublicProfileData_SERVER] - Fetching data for public profile UID: ${userId}`);
  
  // 1. Fetch user profile
  const userDocRef = adminFirestore.collection(USERS_COLLECTION).doc(userId);
  const userDocSnap = await userDocRef.get();

  if (!userDocSnap.exists) {
    console.log(`[SERVICE_SERVER/getPublicProfileData_SERVER] - Profile not found for UID: ${userId}`);
    return { error: 'User profile not found.', status: 404 };
  }
  const profile = userDocSnap.data() as UserProfile;

  // 2. Check if profile is public
  if (!profile.isPublicProfileEnabled) {
    console.log(`[SERVICE_SERVER/getPublicProfileData_SERVER] - Profile is private for UID: ${userId}`);
    return { error: 'This profile is not public.', status: 403 };
  }

  // 3. Fetch public certificates from MongoDB
  try {
    const { db } = await connectToDb();
    const filesCollection = db.collection('images.files');
    const query = {
      'metadata.userId': userId,
      'metadata.visibility': { '$ne': 'private' } // Only get public (or unset) images
    };
    
    console.log(`[SERVICE_SERVER/getPublicProfileData_SERVER] - Querying Mongo for public images for UID: ${userId} with query:`, query);
    const userImages = await filesCollection.find(
      query,
      {
        projection: {
          _id: 1,
          filename: 1,
          uploadDate: 1,
          contentType: 1,
          length: 1,
          metadata: 1
        }
      }
    ).sort({ uploadDate: -1 }).toArray();
    console.log(`[SERVICE_SERVER/getPublicProfileData_SERVER] - Found ${userImages.length} public images for UID: ${userId}`);

    const formattedImages = userImages.map(img => ({
      fileId: img._id.toString(),
      filename: img.filename,
      uploadDate: (img.uploadDate as Date).toISOString(), // Ensure it's a serializable string
      contentType: img.contentType,
      originalName: img.metadata?.originalName || img.filename,
      dataAiHint: img.metadata?.dataAiHint || '',
      size: img.length || 0,
      userId: img.metadata?.userId,
      visibility: img.metadata?.visibility || 'public',
    }));
    
    return { profile, images: formattedImages };

  } catch (error: any) {
    console.error(`[SERVICE_SERVER/getPublicProfileData_SERVER] - Error fetching public images for user ${userId}:`, error);
    return { error: 'Could not load certificates for this profile.', status: 500 };
  }
};
