
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/adminConfig';
import { connectToDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API Route /api/admin/download-zip (Req ID: ${reqId}): POST request received.`);

  try {
    // 1. Authenticate the request
    const adminAuth = getAdminAuth();
    const authorizationHeader = request.headers.get('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized: Missing or invalid ID token.' }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const adminUid = decodedToken.uid;
    console.log(`API (Req ID: ${reqId}): Token verified for admin UID: ${adminUid}.`);

    // 2. Parse request body for fileIds
    const { fileIds } = await request.json();
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ message: 'fileIds must be a non-empty array.' }, { status: 400 });
    }
    console.log(`API (Req ID: ${reqId}): Received ${fileIds.length} fileIds to zip.`);

    // 3. Connect to DB and start zipping
    const { bucket } = await connectToDb();
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });
    
    archive.on('warning', function(err) {
        if (err.code === 'ENOENT') {
            console.warn(`API (Req ID: ${reqId}): Archiver warning (ENOENT): `, err);
        } else {
            throw err;
        }
    });
    archive.on('error', function(err) {
        console.error(`API (Req ID: ${reqId}): Archiver has thrown a critical error: `, err);
        throw err;
    });

    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Asynchronously append files to the archive
    const appendFiles = async () => {
        for (const fileId of fileIds) {
            if (!ObjectId.isValid(fileId)) {
                console.warn(`API (Req ID: ${reqId}): Skipping invalid fileId: ${fileId}`);
                continue;
            }
            const objectId = new ObjectId(fileId);
            const fileInfoArray = await bucket.find({ _id: objectId }).limit(1).toArray();
    
            if (fileInfoArray.length === 0) {
                console.warn(`API (Req ID: ${reqId}): File not found in GridFS for ID: ${fileId}. Skipping.`);
                continue;
            }
    
            const fileInfo = fileInfoArray[0];
            const downloadStream = bucket.openDownloadStream(objectId);
            
            let fileName = fileInfo.metadata?.originalName || fileInfo.filename || `${fileId}.file`;
            
            // Sanitize filename and ensure it has a proper extension
            fileName = fileName.replace(/[/\\?%*:|"<>]/g, '-'); // Replace invalid characters
            const hasExtension = /\.[^/.]+$/.test(fileName);
            
            if (!hasExtension && fileInfo.contentType) {
                const mimeType = fileInfo.contentType;
                let extension = '';
                if (mimeType === 'image/jpeg') extension = 'jpg';
                else if (mimeType === 'image/png') extension = 'png';
                else if (mimeType === 'image/gif') extension = 'gif';
                else if (mimeType === 'image/webp') extension = 'webp';
                else if (mimeType === 'application/pdf') extension = 'pdf';
                
                if (extension) {
                    fileName = `${fileName}.${extension}`;
                }
            }

            archive.append(downloadStream, { name: fileName });
            console.log(`API (Req ID: ${reqId}): Appended "${fileName}" to zip.`);
        }
        await archive.finalize();
        console.log(`API (Req ID: ${reqId}): Archiver finalized.`);
    };
    
    appendFiles().catch(err => {
      console.error(`API (Req ID: ${reqId}): Error during file appending process. Throwing error to PassThrough stream.`, err);
      passthrough.emit('error', err);
    });
    
    // 4. Return the stream
    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="certificates-${reqId}.zip"`);
    
    const readableStream = new ReadableStream({
        start(controller) {
            passthrough.on('data', (chunk) => controller.enqueue(chunk));
            passthrough.on('end', () => controller.close());
            passthrough.on('error', (err) => controller.error(err));
        }
    });

    return new NextResponse(readableStream, { headers });

  } catch (error: any) {
    console.error(`API /api/admin/download-zip (Req ID: ${reqId}): CRITICAL ERROR.`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    return NextResponse.json({ message: `An internal server error occurred: ${error.message}` }, { status: 500 });
  }
}
