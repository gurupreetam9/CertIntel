
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/adminConfig';
import { connectToDb } from '@/lib/mongodb';
import type { UserProfile } from '@/lib/models/user';

const USERS_COLLECTION = 'users';

export async function GET(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/admin/dashboard-data (Req ID: ${reqId}): GET request received.`);

  try {
    const adminAuth = getAdminAuth();
    const adminFirestore = getAdminFirestore();

    // 1. Authenticate the request
    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const adminUid = decodedToken.uid;
    console.log(`API (Req ID: ${reqId}): Token verified for UID: ${adminUid}.`);

    // 2. Authorize: Check if requester is an admin
    const adminProfileSnap = await adminFirestore.collection(USERS_COLLECTION).doc(adminUid).get();
    if (!adminProfileSnap.exists || adminProfileSnap.data()?.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden: You are not authorized to perform this action.' }, { status: 403 });
    }
    console.log(`API (Req ID: ${reqId}): Requester ${adminUid} verified as admin.`);

    // 3. Get all linked students
    const studentsQuery = adminFirestore.collection(USERS_COLLECTION)
      .where('role', '==', 'student')
      .where('associatedAdminFirebaseId', '==', adminUid)
      .where('linkRequestStatus', '==', 'accepted');
      
    const studentsSnapshot = await studentsQuery.get();
    const studentProfiles: UserProfile[] = [];
    const studentIdToProfileMap = new Map<string, UserProfile>();

    studentsSnapshot.forEach(doc => {
      const studentData = doc.data() as UserProfile;
      studentProfiles.push(studentData);
      studentIdToProfileMap.set(studentData.uid, studentData);
    });

    const studentUids = studentProfiles.map(s => s.uid);
    console.log(`API (Req ID: ${reqId}): Found ${studentUids.length} linked students.`);

    if (studentUids.length === 0) {
      return NextResponse.json([], { status: 200 }); // Return empty array if no students
    }

    // 4. Connect to MongoDB and fetch all certificates for these students
    const { db } = await connectToDb();
    const filesCollection = db.collection('images.files');
    const certificatesQuery = { 'metadata.userId': { $in: studentUids } };
    
    const certificates = await filesCollection.find(
      certificatesQuery,
      {
        projection: {
          _id: 1,
          filename: 1,
          uploadDate: 1,
          contentType: 1,
          length: 1,
          'metadata.originalName': 1,
          'metadata.userId': 1,
        }
      }
    ).toArray();

    console.log(`API (Req ID: ${reqId}): Found ${certificates.length} total certificates for linked students.`);

    // 5. Augment certificate data with student info
    const dashboardData = certificates.map(cert => {
      const studentProfile = studentIdToProfileMap.get(cert.metadata.userId);
      return {
        fileId: cert._id.toString(),
        filename: cert.filename,
        uploadDate: cert.uploadDate,
        contentType: cert.contentType,
        originalName: cert.metadata.originalName || cert.filename,
        size: cert.length || 0,
        // Augmented data
        studentId: studentProfile?.uid,
        studentName: studentProfile?.displayName || 'Unknown Student',
        studentEmail: studentProfile?.email,
        studentRollNo: studentProfile?.rollNo,
      };
    });

    return NextResponse.json(dashboardData, { status: 200 });

  } catch (error: any) {
    console.error(`API /api/admin/dashboard-data (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    return NextResponse.json({ message: `An internal server error occurred: ${error.message}` }, { status: 500 });
  }
}
