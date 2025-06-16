
# CertIntel

This is a Next.js application scaffolded for CertIntel, featuring Firebase Authentication and Storage, with planned MongoDB integration for metadata and a Flask server for AI features. It also includes Genkit for AI flow management and Nodemailer for email notifications.

## Getting Started

### 1. Prerequisites

*   Node.js (v18 or later recommended)
*   npm, yarn, or pnpm

### 2. Setup Environment Variables

Create a `.env.local` file in the root of the project by copying the `.env` file (if you only have `.env.example`, copy that instead):

```bash
cp .env .env.local 
# or if .env doesn't exist and .env.example does:
# cp .env.example .env.local
```

Then, fill in the required Firebase project configuration details, MongoDB URI, Flask URL, and Gmail credentials in `.env.local`:

*   `NEXT_PUBLIC_FIREBASE_API_KEY`
*   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
*   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
*   `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
*   `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
*   `NEXT_PUBLIC_FIREBASE_APP_ID`
*   `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (Optional, for Firebase Analytics)
*   `MONGODB_URI` (Your MongoDB connection string)
*   `MONGODB_DB_NAME` (Your MongoDB database name, e.g., `imageverse_db`)
*   `NEXT_PUBLIC_FLASK_SERVER_URL` (Your Python Flask server endpoint for the AI feature, e.g., `http://localhost:5000`)
*   `GOOGLE_APPLICATION_CREDENTIALS` (For Firebase Admin SDK: path to your service account JSON file for local dev, or the JSON content itself. Often auto-configured in App Hosting.)
*   `GMAIL_EMAIL_ADDRESS` (Your Gmail address for sending OTP and notification emails)
*   `GMAIL_APP_PASSWORD` (Your Gmail App Password if 2FA is enabled, otherwise your regular password - App Password highly recommended)

**Note on `GOOGLE_APPLICATION_CREDENTIALS`**:
For local development, this should typically be the absolute path to your Firebase service account key JSON file.
Example: `GOOGLE_APPLICATION_CREDENTIALS="/Users/yourname/secrets/my-firebase-project-firebase-adminsdk.json"`
Alternatively, the `adminConfig.ts` file has logic to parse this variable if it contains the JSON content directly (e.g., `GOOGLE_APPLICATION_CREDENTIALS='{"type": "service_account", ...}'`), though providing a file path is more standard for this variable.
In Firebase App Hosting or Google Cloud environments, Application Default Credentials might be used automatically if this variable is not set.

### 3. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 4. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:9005](http://localhost:9005) (or the port specified in your `package.json` dev script) with your browser to see the result.

### 5. Genkit Development (Optional)

If you are working with Genkit AI flows:
```bash
npm run genkit:dev
# or for watching changes
npm run genkit:watch
```
This will start the Genkit development server, typically on port 4000, allowing you to inspect and test your flows.

## Project Structure

*   `src/app/`: Contains all the routes and UI for the application (App Router).
    *   `src/app/page.tsx`: The main home page for authenticated users.
    *   `src/app/login/page.tsx`: User login page.
    *   `src/app/register/page.tsx`: User registration page (multi-step with role selection, OTP email verification).
    *   `src/app/forgot-password/page.tsx`: Password reset page.
    *   `src/app/profile-settings/page.tsx`: User profile management, including linking with Admin for students.
    *   `src/app/admin/dashboard/page.tsx`: Admin dashboard for managing student link requests and viewing linked students.
    *   `src/app/admin/student-certificates/[studentId]/page.tsx`: Page for admins to view a specific student's certificates.
    *   `src/app/ai-feature/page.tsx`: Page for AI integration (certificate processing, course suggestions via Flask).
    *   `src/app/api/`: API routes (e.g., for image upload, metadata, Genkit flows).
*   `src/components/`: Reusable UI components.
    *   `src/components/auth/`: Authentication related components (AuthForm, ProtectedPage).
    *   `src/components/home/`: Components specific to the home page (ImageGrid, UploadFAB, AiFAB, Modals).
    *   `src/components/layout/`: Layout components like SiteHeader.
    *   `src/components/common/`: General purpose components like AppLogo.
    *   `src/components/ui/`: ShadCN UI components.
*   `src/lib/`: Utility functions and libraries.
    *   `src/lib/firebase/`: Firebase configuration (client & admin) and service functions.
    *   `src/lib/mongodb.ts`: MongoDB connection utility.
    *   `src/lib/services/`: Service layer functions (userService, emailUtils).
    *   `src/lib/models/`: TypeScript type definitions for data models (user, etc.).
*   `src/ai/`: Genkit AI flows and configuration.
    *   `src/ai/flows/`: Specific AI flows (OTP, registration, image processing).
    *   `src/ai/genkit.ts`: Genkit global configuration.
    *   `src/ai/dev.ts`: Genkit development server entry point.
*   `src/context/`: React Context providers (AuthContext).
*   `src/hooks/`: Custom React hooks (useAuth, useToast, useTheme, useMobile).
*   `src/types/`: TypeScript type definitions (auth types).
*   `public/`: Static assets.
*   `app.py`: Python Flask server for OCR and AI suggestions (run separately).
*   `certificate_processor.py`: Python module used by `app.py`.

## Key Features Implemented

*   **User Authentication**: Login, multi-step Registration (Role selection, Email OTP verification, details), Logout, Password Reset.
*   **Role-Based Access**: Differentiates between 'student' and 'admin' roles.
*   **Profile Management**: Users can update their display name. Students can manage their link with an Admin/Teacher. Admins have a unique shareable ID.
*   **Admin Dashboard**: Admins can view pending student link requests (real-time updates), accept/reject them, and view their linked students' certificates.
*   **Student-Admin Linking**: Students can request to link with an admin using the admin's unique ID. Admins approve/reject these requests.
*   **Image/PDF Upload**:
    *   Central "+" icon (Floating Action Button) for uploading images/PDFs.
    *   Uploads files to MongoDB GridFS via Next.js backend. PDFs are converted to images page-by-page by a Flask server.
    *   Upload progress indication.
*   **Image Display**: User-uploaded images/certificates displayed in a grid on the home page. Admins can view linked students' certificates.
*   **AI Integration (via Flask & Genkit)**:
    *   `/ai-feature` page interacts with Flask server for certificate OCR and course suggestions.
    *   Genkit flows for email OTP, registration, and potentially image description/tagging.
*   **Email Notifications**:
    *   OTP emails for registration.
    *   Registration confirmation emails.
    *   Emails to students when their link request to an admin is accepted or rejected.
*   **Styling**:
    *   Uses Tailwind CSS and ShadCN UI components.
    *   Custom theme based on Gold, Light Beige, Vivid Orange.
    *   Custom fonts: 'Poppins' for headlines, 'Open Sans' for body text.
*   **Responsive Design**: Basic responsiveness for various screen sizes.

## Further Development

*   **Image Editor**: Implement crop and resize functionality in upload modal (currently a placeholder).
*   **MongoDB Integration (Advanced)**:
    *   Refine database schemas for user_course_processing_results, manual_course_names.
    *   Secure API endpoints for managing this data.
*   **Advanced Mobile Upload**: Refine Camera vs. File Manager prompt on mobile for better UX.
*   **Desktop Folder Upload**: Implement or provide clear instructions for folder uploads on desktop.
*   **Error Handling and UI Feedback**: Enhance error handling and user feedback across the application, especially for network and API interactions.
*   **Testing**: Add unit, integration, and end-to-end tests.
*   **Security**: Thoroughly review Firestore security rules for production. Harden API endpoints.
*   **Production Email Service**: For production, consider a more robust email sending service than Gmail via Nodemailer (e.g., SendGrid, Mailgun).
*   **Genkit Production Deployment**: Configure Genkit flows for a production environment.
*   **OTP Storage**: Replace in-memory OTP store with a persistent database solution for production.
*   **Scalability**: Review and optimize for scalability as user base grows.
