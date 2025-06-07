
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { connectToDb } from '@/lib/mongodb';
import formidable from 'formidable';
import fs from 'fs'; // Needed to read file stream from formidable

// Import pdfjs-dist and canvas for server-side PDF processing
// Using the main package require, letting Node.js resolve the correct CJS entry point.
const pdfjsLib = require('pdfjs-dist');
import { createCanvas, type Canvas } from 'canvas';

// Helper to make formidable work with Next.js Edge/Node.js runtime
const parseForm = (req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
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
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
  }
  destroy(canvasAndContext: { canvas: Canvas; context: any }) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      // @ts-ignore
      canvasAndContext.canvas = null;
      // @ts-ignore
      canvasAndContext.context = null;
    }
  }
}


export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);

  try { // Outermost try-catch to ensure JSON response
    let dbConnection;
    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Attempting DB connection...`);
      dbConnection = await connectToDb();
      if (!dbConnection || !dbConnection.bucket || !dbConnection.db) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error - connectToDb returned invalid structure.`);
        const dbConnectError = new Error('Server error: Database or GridFS bucket not initialized after connectToDb call.');
        dbConnectError.name = 'DBInitializationError';
        throw dbConnectError;
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): DB connected, GridFS bucket obtained.`);
    } catch (dbError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error.`, { message: dbError.message, name: dbError.name, stack: dbError.stack?.substring(0,500) });
      throw dbError; // Re-throw to be caught by the main handler
    }
    
    const { bucket } = dbConnection;
    let fields: formidable.Fields;
    let files: formidable.Files;

    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Parsing form data...`);
      const parsedForm = await parseForm(request);
      fields = parsedForm.fields;
      files = parsedForm.files;
      console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed. Fields: ${Object.keys(fields).join(', ')}. Files: ${files.file ? (files.file[0] as formidable.File).originalFilename : 'No file field'}`);
    } catch (formError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error.`, { message: formError.message, name: formError.name, stack: formError.stack?.substring(0,500) });
      const specificFormError = new Error(`Failed to parse form data (Req ID: ${reqId}): ${formError.message}`);
      specificFormError.name = 'FormParsingError';
      throw specificFormError;
    }

    const userIdField = fields.userId;
    const originalNameField = fields.originalName;
    const contentTypeField = fields.contentType;

    const userId = Array.isArray(userIdField) ? userIdField[0] : userIdField;
    const originalNameFromField = Array.isArray(originalNameField) ? originalNameField[0] : originalNameField;
    const clientContentType = Array.isArray(contentTypeField) ? contentTypeField[0] : contentTypeField;


    if (!userId || !originalNameFromField) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Missing userId or originalName. UserID: ${userId}, OriginalName: ${originalNameFromField}`);
      const missingFieldsError = new Error('Missing userId or originalName in form data.');
      missingFieldsError.name = 'MissingFieldsError';
      throw missingFieldsError;
    }

    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field.`);
      const noFileError = new Error('No file uploaded.');
      noFileError.name = 'NoFileUploadedError';
      throw noFileError;
    }
    const uploadedFile = fileArray[0] as formidable.File; 
    const actualOriginalName = uploadedFile.originalFilename || originalNameFromField; 

    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];
    const fileType = uploadedFile.mimetype || clientContentType;

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing PDF: ${actualOriginalName}`);
      let pdfDocument;
      try {
        const pdfBuffer = fs.readFileSync(uploadedFile.filepath);
        console.log(`API /api/upload-image (Req ID: ${reqId}): PDF buffer read (size: ${pdfBuffer.length}). Loading document...`);
        pdfDocument = await pdfjsLib.getDocument({ data: pdfBuffer, useWorkerFetch: false, isEvalSupported: false }).promise;
        console.log(`API /api/upload-image (Req ID: ${reqId}): PDF document loaded with ${pdfDocument.numPages} pages.`);
      } catch (pdfLoadError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Error loading PDF document "${actualOriginalName}".`, { message: pdfLoadError.message, name: pdfLoadError.name, stack: pdfLoadError.stack?.substring(0, 500) });
        const specificPdfLoadError = new Error(`Failed to load PDF "${actualOriginalName}" (Req ID: ${reqId}): ${pdfLoadError.message}`);
        specificPdfLoadError.name = 'PdfLoadError';
        throw specificPdfLoadError;
      }

      const canvasFactory = new NodeCanvasFactory(); 

      for (let i = 1; i <= pdfDocument.numPages; i++) {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Processing page ${i} of ${pdfDocument.numPages} for PDF "${actualOriginalName}".`);
        let page;
        let canvasAndContext: any; 
        try {
          page = await pdfDocument.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 }); 
          canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

          const renderContext = {
            canvasContext: canvasAndContext.context,
            viewport: viewport,
            canvasFactory: canvasFactory,
          };

          console.log(`API /api/upload-image (Req ID: ${reqId}): Rendering page ${i}...`);
          await page.render(renderContext).promise;
          console.log(`API /api/upload-image (Req ID: ${reqId}): Page ${i} rendered. Converting to buffer...`);
          const imageBuffer = canvasAndContext.canvas.toBuffer('image/png'); 
          
          const pageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '_')}_page_${i}.png`;
          const metadata = {
            originalName: `${actualOriginalName} (Page ${i})`,
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
              .on('error', (err: MongoError) => { 
                console.error(`GridFS Stream Error for PDF page ${pageFilename} (Req ID: ${reqId}):`, err);
                rejectStream(new Error(`GridFS upload error for ${pageFilename} (Req ID: ${reqId}): ${err.message}`));
              })
              .on('finish', () => {
                console.log(`GridFS Upload finished for PDF page: ${pageFilename}, ID: ${uploadStream.id} (Req ID: ${reqId})`);
                results.push({ originalName: metadata.originalName, fileId: uploadStream.id.toString(), filename: pageFilename, pageNumber: i });
                resolveStream();
              });
          });
        } catch (pageProcessingError: any) {
          console.error(`API /api/upload-image (Req ID: ${reqId}): Error processing page ${i} of PDF "${actualOriginalName}".`, { message: pageProcessingError.message, name: pageProcessingError.name, stack: pageProcessingError.stack?.substring(0,500) });
           const specificPageError = new Error(`Failed to process page ${i} of PDF "${actualOriginalName}" (Req ID: ${reqId}): ${pageProcessingError.message}`);
           specificPageError.name = 'PdfPageProcessingError';
           throw specificPageError;
        } finally {
          if (page) page.cleanup(); 
          if (canvasAndContext) canvasFactory.destroy(canvasAndContext); 
          console.log(`API /api/upload-image (Req ID: ${reqId}): Cleaned up resources for page ${i}.`);
        }
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF ${actualOriginalName} processed into ${results.length} pages.`);

    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing Image: ${actualOriginalName}`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
      };

      console.log(`GridFS (upload-image, Req ID: ${reqId}): Uploading image "${imageFilename}" with contentType "${fileType}".`);
      const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
      const readable = fs.createReadStream(uploadedFile.filepath);

      await new Promise<void>((resolveStream, rejectStream) => {
        readable.pipe(uploadStream)
          .on('error', (err: MongoError) => { 
            console.error(`GridFS Stream Error for image ${imageFilename} (Req ID: ${reqId}):`, err);
            rejectStream(new Error(`GridFS upload error for ${imageFilename} (Req ID: ${reqId}): ${err.message}`));
          })
          .on('finish', () => {
            console.log(`GridFS Upload finished for image: ${imageFilename}, ID: ${uploadStream.id} (Req ID: ${reqId})`);
            results.push({ originalName: actualOriginalName, fileId: uploadStream.id.toString(), filename: imageFilename });
            resolveStream();
          });
      });
    } else {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${actualOriginalName}`);
      const unsupportedFileTypeError = new Error(`Unsupported file type: ${fileType}. Please upload an image or PDF.`);
      unsupportedFileTypeError.name = 'UnsupportedFileTypeError';
      throw unsupportedFileTypeError;
    }

    if (uploadedFile.filepath && fs.existsSync(uploadedFile.filepath)) {
        try {
            fs.unlinkSync(uploadedFile.filepath);
            console.log(`API /api/upload-image (Req ID: ${reqId}): Temp file ${uploadedFile.filepath} deleted.`);
        } catch (unlinkError: any) {
            console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete temp file ${uploadedFile.filepath}. Error: ${unlinkError.message}`);
        }
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed. Results:`, results);
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`API /api/upload-image (Req ID: ${reqId}): CRITICAL UNHANDLED ERROR IN POST HANDLER.`, {
        errorMessage: error.message,
        errorType: error.constructor?.name,
        errorStack: error.stack?.substring(0, 700), 
        reqId,
    });
    
    const responseMessage = error.message || 'An unexpected critical error occurred during file upload.';
    const errorKey = error.name || 'UNKNOWN_SERVER_ERROR';

    return NextResponse.json(
      [{ message: `Server Error (Req ID: ${reqId}): ${responseMessage}`, error: errorKey, details: error.toString() }],
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
