import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
// import { MongoClient, ServerApiVersion } from 'mongodb'; // Uncomment when ready for MongoDB

// IMPORTANT: This is a placeholder for your MongoDB connection URI.
// Store it in your .env.local file as MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI;

// Example metadata structure expected from client
interface ImageMetadata {
  originalName: string;
  storagePath: string; // Firebase storage path
  downloadURL: string;
  userId: string;
  timestamp: string; // ISO date string
}

// IMPORTANT: Protect this API route!
// In a real application, you should verify the user's Firebase ID token
// passed in the Authorization header to ensure only authenticated users can call this.

export async function POST(request: NextRequest) {
  try {
    const metadataArray: ImageMetadata[] | ImageMetadata = await request.json();
    
    // Ensure it's an array for consistent processing
    const itemsToSave = Array.isArray(metadataArray) ? metadataArray : [metadataArray];

    if (!itemsToSave || itemsToSave.length === 0) {
      return NextResponse.json({ message: 'No metadata provided.' }, { status: 400 });
    }

    // --- MONGODB INTEGRATION (User to implement) ---
    // This is where you would connect to MongoDB and save the metadata.
    // For now, we'll just log it.

    console.log('Received metadata to save:', JSON.stringify(itemsToSave, null, 2));

    if (!MONGODB_URI) {
      console.warn('MONGODB_URI is not set. Metadata not saved to DB. Skipping database operation.');
      return NextResponse.json(
        { message: 'Metadata received but not saved to DB (MONGODB_URI not set).', data: itemsToSave },
        { status: 200 }
      );
    }
    
    /* 
    // Example MongoDB connection and insertion (uncomment and adapt)
    const client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });

    try {
      await client.connect();
      const db = client.db("myapp"); // Replace "myapp" with your database name
      const collection = db.collection("images"); // Replace "images" with your collection name
      
      const result = await collection.insertMany(itemsToSave);
      console.log(`${result.insertedCount} documents were inserted into the images collection.`);
      
      return NextResponse.json({ message: 'Metadata saved successfully.', insertedCount: result.insertedCount }, { status: 201 });

    } catch (dbError: any) {
      console.error('Failed to save metadata to MongoDB:', dbError);
      return NextResponse.json({ message: 'Failed to save metadata to database.', error: dbError.message }, { status: 500 });
    } finally {
      await client.close();
    }
    */
    
    // Fallback response if MongoDB code is commented out
    return NextResponse.json(
        { message: 'Metadata received. MongoDB logic is commented out.', data: itemsToSave },
        { status: 200 }
    );

  } catch (error: any) {
    console.error('Error processing metadata request:', error);
    return NextResponse.json({ message: 'Error processing request.', error: error.message }, { status: 500 });
  }
}
