# ImageVerse

This is a Next.js application scaffolded for ImageVerse, featuring Firebase Authentication and Storage, with planned MongoDB integration for metadata and a Flask server for AI features.

## Getting Started

### 1. Prerequisites

*   Node.js (v18 or later recommended)
*   npm, yarn, or pnpm

### 2. Setup Environment Variables

Create a `.env.local` file in the root of the project by copying the `.env.example` file:

```bash
cp .env.example .env.local
```

Then, fill in the required Firebase project configuration details and other service URLs in `.env.local`:

*   `NEXT_PUBLIC_FIREBASE_API_KEY`
*   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
*   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
*   `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
*   `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
*   `NEXT_PUBLIC_FIREBASE_APP_ID`
*   `MONGODB_URI` (Your MongoDB connection string)
*   `NEXT_PUBLIC_FLASK_SERVER_URL` (Your Python Flask server endpoint for the AI feature)

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

Open [http://localhost:9002](http://localhost:9002) (or the port specified in your `package.json` dev script) with your browser to see the result.

## Project Structure

*   `src/app/`: Contains all the routes and UI for the application (App Router).
    *   `src/app/page.tsx`: The main home page for authenticated users.
    *   `src/app/login/page.tsx`: User login page.
    *   `src/app/register/page.tsx`: User registration page.
    *   `src/app/ai-feature/page.tsx`: Page for AI integration.
    *   `src/app/api/`: API routes (e.g., for metadata).
*   `src/components/`: Reusable UI components.
    *   `src/components/auth/`: Authentication related components.
    *   `src/components/home/`: Components specific to the home page.
    *   `src/components/layout/`: Layout components like SiteHeader.
    *   `src/components/common/`: General purpose components like AppLogo.
    *   `src/components/ui/`: ShadCN UI components.
*   `src/lib/`: Utility functions and libraries.
    *   `src/lib/firebase/`: Firebase configuration and service functions.
*   `src/context/`: React Context providers (e.g., AuthContext).
*   `src/hooks/`: Custom React hooks.
*   `src/types/`: TypeScript type definitions.
*   `public/`: Static assets.

## Key Features Implemented

*   **User Authentication**: Login and Registration pages using Firebase Authentication (Email & Password).
*   **Image Upload**:
    *   Central "+" icon (Floating Action Button) for uploading images.
    *   Image previews and upload progress.
    *   Uploads images to Firebase Cloud Storage.
    *   Basic UI for selecting images from device or camera (on mobile).
*   **Metadata Storage**:
    *   After upload, sends metadata (filename, user ID, timestamp, downloadURL) to an API endpoint (`/api/metadata`).
    *   The API endpoint is set up to receive data; MongoDB integration logic needs to be completed by the user.
*   **Profile Management**: Profile icon on the Home screen (top right) with a Logout option.
*   **AI Integration**:
    *   An AI icon (Floating Action Button) linking to `/ai-feature`.
    *   The AI feature page embeds content from a configured Python Flask server endpoint using an iframe.
*   **Styling**:
    *   Uses Tailwind CSS and ShadCN UI components.
    *   Custom theme based on the provided color palette (Gold, Light Beige, Vivid Orange).
    *   Custom fonts: 'Belleza' for headlines, 'Alegreya' for body text.
*   **Responsive Design**: Basic responsiveness for various screen sizes.

## Further Development

*   **Image Editor**: Implement crop and resize functionality (currently a placeholder).
*   **MongoDB Integration**: Complete the MongoDB connection and data saving logic in `/src/app/api/metadata/route.ts`.
*   **Image Display**: Fetch and display user-uploaded images from MongoDB on the home page grid.
*   **Advanced Mobile Upload**: Refine the Camera vs. File Manager prompt on mobile.
*   **Desktop Folder Upload**: Implement or provide clear instructions for folder uploads on desktop.
*   **Error Handling and UI Feedback**: Enhance error handling and user feedback across the application.
*   **Testing**: Add unit and integration tests.
