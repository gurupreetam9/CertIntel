
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { connectToDb } from '@/lib/mongodb';
import formidable from 'formidable';
import fs from 'fs'; // Needed to read file stream from formidable
// Import pdfjs-dist and canvas for server-side PDF processing
const pdfjsLib = require('pdfjs-dist');
import { createCanvas, type Canvas } from 'canvas';

// Helper to make formidable work with Next.js Edge/Node.js runtime
const parseForm = (req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false, // Handle one file at a time from client loop, or adjust if batching
      // maxFileSize: 100 * 1024 * 1024, // 100MB limit, example
    });
    form.parse(req as any, (err, fields, files) => {
      if (err) {
        console.error('API /api/upload-image: Formidable parsing error', err);
        reject(err);
        return;
      }
      resolve({ fields, files });
    });
  });
};

// Helper class for PDF rendering with canvas
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas: canvas as any, // Type assertion for compatibility
      context,
    };
  }
  reset(canvasAndContext: { canvas: Canvas; context: any }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: { canvas: Canvas; context: any }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    // @ts-ignore
    canvasAndContext.canvas = null;
    // @ts-ignore
    canvasAndContext.context = null;
  }
}


export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);

  let dbConnection;
  try {
    dbConnection = await connectToDb();
    if (!dbConnection || !dbConnection.bucket || !dbConnection.db) {
      throw new Error('Server error: Database or GridFS bucket not initialized.');
    }
    const { bucket, db } = dbConnection;
    console.log(`API /api/upload-image (Req ID: ${reqId}): DB connected, GridFS bucket obtained.`);

    const { fields, files } = await parseForm(request);

    const userId = fields.userId?.[0] as string;
    const originalName = fields.originalName?.[0] as string;
    const clientContentType = fields.contentType?.[0] as string; // Content type from client

    if (!userId || !originalName) {
      return NextResponse.json([{ message: 'Missing userId or originalName in form data.' }], { status: 400 });
    }

    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return NextResponse.json([{ message: 'No file uploaded.' }], { status: 400 });
    }
    const uploadedFile = fileArray[0];


    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];

    // Determine file type (from formidable or clientContentType as fallback)
    const fileType = uploadedFile.mimetype || clientContentType;

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing PDF: ${originalName}`);
      const pdfBuffer = fs.readFileSync(uploadedFile.filepath);
      const pdfDocument = await pdfjsLib.getDocument({ data: pdfBuffer, useWorkerFetch: false, isEvalSupported: false }).promise;

      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // Adjust scale for rendering quality

        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

        const renderContext = {
          canvasContext: canvasAndContext.context,
          viewport: viewport,
          canvasFactory: canvasFactory,
        };

        await page.render(renderContext).promise;
        const imageBuffer = canvasAndContext.canvas.toBuffer('image/png'); // Store as PNG
        page.cleanup(); // Important to free memory
        canvasFactory.destroy(canvasAndContext); // Explicitly destroy canvas resources

        const pageFilename = `${userId}_${Date.now()}_${originalName.replace(/\.pdf$/i, '')}_page_${i}.png`;
        const metadata = {
          originalName: `${originalName} (Page ${i})`,
          userId,
          uploadedAt: new Date().toISOString(),
          sourceContentType: 'application/pdf',
          convertedTo: 'image/png',
          pageNumber: i,
        };

        console.log(`GridFS (upload-image, Req ID: ${reqId}): Uploading PDF page ${i} as "${pageFilename}"`);
        const uploadStream = bucket.openUploadStream(pageFilename, { contentType: 'image/png', metadata });
        const readable = Readable.from(imageBuffer);

        await new Promise<void>((resolveStream, rejectStream) => {
          readable.pipe(uploadStream)
            .on('error', (err) => {
              console.error(`GridFS Stream Error for PDF page ${pageFilename}:`, err);
              rejectStream(err);
            })
            .on('finish', () => {
              console.log(`GridFS Upload finished for PDF page: ${pageFilename}, ID: ${uploadStream.id}`);
              results.push({ originalName: metadata.originalName, fileId: uploadStream.id.toString(), filename: pageFilename, pageNumber: i });
              resolveStream();
            });
        });
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF ${originalName} processed into ${results.length} pages.`);
    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing Image: ${originalName}`);
      const imageFilename = `${userId}_${Date.now()}_${originalName.replace(/\s+/g, '_')}`;
      const metadata = {
        originalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
      };

      console.log(`GridFS (upload-image, Req ID: ${reqId}): Uploading image "${imageFilename}" with contentType "${fileType}".`);
      const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
      const readable = fs.createReadStream(uploadedFile.filepath);

      await new Promise<void>((resolveStream, rejectStream) => {
        readable.pipe(uploadStream)
          .on('error', (err) => {
            console.error(`GridFS Stream Error for image ${imageFilename}:`, err);
            rejectStream(err);
          })
          .on('finish', () => {
            console.log(`GridFS Upload finished for image: ${imageFilename}, ID: ${uploadStream.id}`);
            results.push({ originalName, fileId: uploadStream.id.toString(), filename: imageFilename });
            resolveStream();
          });
      });
    } else {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${originalName}`);
      return NextResponse.json([{ message: `Unsupported file type: ${fileType}. Please upload an image or PDF.` }], { status: 415 });
    }

    // Cleanup temp file from formidable
    if (uploadedFile.filepath && fs.existsSync(uploadedFile.filepath)) {
        fs.unlinkSync(uploadedFile.filepath);
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed. Results:`, results);
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`API /api/upload-image (Req ID: ${reqId}): Unhandled error.`, {
        errorMessage: error.message,
        errorType: error.constructor?.name,
        errorStack: error.stack?.substring(0, 500)
    });
    const errorPayload = {
        message: error.message || 'An unexpected error occurred during file upload.',
        error: 'UPLOAD_PROCESSING_ERROR',
    };
    return NextResponse.json([errorPayload], { status: 500 });
  }
}

// Ensure Next.js doesn't try to parse the body for this route if it's FormData
export const config = {
  api: {
    bodyParser: false,
  },
};
