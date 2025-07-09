
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/adminConfig';
import {
  createUserProfileDocument_SERVER,
  createAdminProfile_SERVER,
} from '@/lib/services/userService.server';
import { z } from 'zod';
import { sendEmail } from '@/lib/emailUtils';
import type { UserProfile } from '@/lib/models/user';

export const runtime = 'nodejs';

const CreateProfileRequestSchema = z.object({
  role: z.enum(['admin', 'student']),
  name: z.string().min(1).max(100).optional(),
  rollNo: z.string().max(50).optional(),
  adminUniqueId: z.string().max(50).optional(),
  isTwoFactorEnabled: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/auth/create-profile (Req ID: ${reqId}): POST request received.`);

  try {
    const adminAuth = getAdminAuth();

    // 1. Authenticate the request
    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    if (!uid || !email) {
      return NextResponse.json({ message: 'Invalid token: UID or email missing.' }, { status: 401 });
    }

    // 2. Validate request body
    const body = await request.json();
    const validation = CreateProfileRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body.', errors: validation.error.format() }, { status: 400 });
    }
    const { role, name, rollNo, adminUniqueId, isTwoFactorEnabled } = validation.data;

    // 3. Create profile document
    let createdProfile: UserProfile | null = null;
    let registrationMessage = 'Registration successful!';
    let adminUniqueIdForResponse: string | undefined = undefined;
    let userDisplayName = name || email.split('@')[0];

    if (role === 'admin') {
      const adminProfileDetails = await createAdminProfile_SERVER(uid, email);
      adminUniqueIdForResponse = adminProfileDetails.adminUniqueId;
      registrationMessage = `Admin registration successful! Your Admin ID is: ${adminUniqueIdForResponse}`;
      
      await sendEmail({
        to: email,
        subject: 'Welcome to CertIntel, Admin!',
        text: `Hello Admin,\n\nYour registration with CertIntel is complete. Your unique Admin ID is: ${adminUniqueIdForResponse}. You can share this ID with your students.\n\nRegards,\nThe CertIntel Team`,
        html: `<p>Hello Admin,</p><p>Your registration with CertIntel is complete. Your unique Admin ID is: <strong>${adminUniqueIdForResponse}</strong>. You can share this ID with your students.</p><p>Regards,<br/>The CertIntel Team</p>`,
      });
      
    } else if (role === 'student') {
      if (!name) {
          return NextResponse.json({ message: "Student name is required." }, { status: 400 });
      }
      userDisplayName = name;
      const studentProfileCreationData = {
          displayName: name,
          rollNo: (rollNo && rollNo.trim() !== '') ? rollNo.trim() : undefined,
          associatedAdminUniqueId: (adminUniqueId && adminUniqueId.trim() !== '') ? adminUniqueId.trim() : undefined,
          isTwoFactorEnabled,
      };

      createdProfile = await createUserProfileDocument_SERVER(uid, email, 'student', studentProfileCreationData);

      let studentWelcomeMessage = `Hello ${userDisplayName},\n\nWelcome to CertIntel! Your registration is complete.`;
      let studentWelcomeHtml = `<p>Hello ${userDisplayName},</p><p>Welcome to CertIntel! Your registration is complete.</p>`;

      if (createdProfile?.associatedAdminUniqueId) {
        studentWelcomeMessage += ` Your request to link with Teacher/Admin ID ${createdProfile.associatedAdminUniqueId} has been initiated and is pending approval.`;
        studentWelcomeHtml += `<p>Your request to link with Teacher/Admin ID <strong>${createdProfile.associatedAdminUniqueId}</strong> has been initiated and is pending approval.</p>`;
        registrationMessage = `Student registration successful! Your request to link with Teacher ID ${createdProfile.associatedAdminUniqueId} is pending.`;
      } else {
         registrationMessage = 'Student registration successful! Welcome to CertIntel!';
      }
      studentWelcomeMessage += `\n\nRegards,\nThe CertIntel Team`;
      studentWelcomeHtml += `<p>Regards,<br/>The CertIntel Team</p>`;

      await sendEmail({
        to: email,
        subject: `Welcome to CertIntel, ${userDisplayName}!`,
        text: studentWelcomeMessage,
        html: studentWelcomeHtml,
      });
    }

    return NextResponse.json({ 
        success: true, 
        message: registrationMessage, 
        userId: uid,
        role,
        adminUniqueIdGenerated: adminUniqueIdForResponse
    }, { status: 201 });

  } catch (error: any) {
    console.error(`API /api/auth/create-profile (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json({ message: `An internal server error occurred: ${error.message}` }, { status: 500 });
  }
}

