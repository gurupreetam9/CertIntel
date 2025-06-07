# **App Name**: ImageVerse

## Core Features:

- User Authentication: Login and registration page using Firebase Authentication with email and password.
- Image Upload: Central upload icon, prompting the user to select between Camera or File Manager on mobile devices and allowing folder or multiple image uploads on desktop.
- Image Editor: Basic UI to crop and resize images before uploading to Firebase Cloud Storage.
- Metadata Storage: Upload image metadata (filename, user ID, timestamp) to a MongoDB collection after uploading the images.
- Profile Management: A Profile icon with a Logout option that returns the user to the login screen upon selection.
- AI Integration: An AI icon that, when clicked, displays content or UI from your Flask server endpoint.

## Style Guidelines:

- Primary color: HSL(45, 90%, 50%) - Gold (#FACC15) to convey quality and inspiration, mirroring the app's image-handling capabilities.
- Background color: HSL(45, 20%, 95%) - Light beige (#F8F7F3) provides a soft, unobtrusive backdrop that complements the richness of uploaded content.
- Accent color: HSL(15, 90%, 50%) - Vivid orange (#FA5715) offers strong contrast for focus on interactive elements.
- Font pairing: 'Belleza' (sans-serif) for headings to create artistic flair and 'Alegreya' (serif) for body to add elegance.
- Use simple, outline-style icons with rounded edges to keep UI uncluttered, intuitive, and user-friendly.
- Implement a responsive layout to maintain consistent UX across both PC and mobile environments.
- Employ smooth transitions and subtle animations upon interactions to elevate UX through improved interface responsiveness.