
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import pdfjs-dist and canvas for server-side PDF processing
// Using the standard CJS build path for pdfjs-dist v4+
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
// Specify the worker source for Node.js environment. Critical for pdfjs-dist v3+
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.mjs');

import { createCanvas, type Canvas } from 'canvas';

// Helper class to adapt Node.js Canvas to pdfjs-dist
class NodeCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid canvas dimensions: ${width}x${height}`);
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas: canvas as unknown as HTMLCanvasElement, // Cast to expected type
      context,
    };
  }

  reset(canvasAndContext: { canvas: HTMLCanvasElement; context: any }, width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid canvas dimensions for reset: ${width}x${height}`);
    }
    if (canvasAndContext.canvas) {
      (canvasAndContext.canvas as unknown as Canvas).width = width;
      (canvasAndContext.canvas as unknown as Canvas).height = height;
    }
  }

  destroy(canvasAndContext: { canvas: HTMLCanvasElement; context: any }) {
    if (canvasAndContext.canvas) {
      // Zero out the width and height to release memory associated with the C++ Canvas
      (canvasAndContext.canvas as unknown as Canvas).width = 0;
      (canvasAndContext.canvas as unknown as Canvas).height = 0;
    }
    (canvasAndContext.canvas as any) = null;
    (canvasAndContext.context as any) = null;
  }
}


// Helper to make formidable work with Next.js Edge/Node.js runtime
const parseForm = (req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false, 
      uploadDir: os.tmpdir(), 
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
    });
    form.parse(req as any, (err, fields, files) => {
      if (err) {
        console.error('API /api/upload-image: Formidable parsing error', {
          message: err.message,
          code: (err as any).code, 
        });
        reject(err);
        return;
      }
      resolve({ fields, files });
    });
  });
};

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);
  
  let formidableTempFilePath: string | undefined; 

  try {
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
      console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error.`, { message: dbError.message, name: dbError.name });
      throw dbError; 
    }
    
    const { bucket } = dbConnection;
    let fields: formidable.Fields;
    let files: formidable.Files;

    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Parsing form data...`);
      const parsedForm = await parseForm(request);
      fields = parsedForm.fields;
      files = parsedForm.files;
      const uploadedFilePreview = files.file ? ((files.file as formidable.File[])[0] as formidable.File) : null;
      console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed. Fields: ${Object.keys(fields).join(', ')}. File: ${uploadedFilePreview ? uploadedFilePreview.originalFilename : 'No file field'}`);
    } catch (formError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error.`, { message: formError.message, name: formError.name });
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

    const fileArray = files.file as formidable.File[] | undefined; 
    if (!fileArray || fileArray.length === 0) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field.`);
      const noFileError = new Error('No file uploaded.');
      noFileError.name = 'NoFileUploadedError';
      throw noFileError;
    }
    const uploadedFile = fileArray[0]; 
    const actualOriginalName = uploadedFile.originalFilename || originalNameFromField; 
    formidableTempFilePath = uploadedFile.filepath; 

    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];
    const fileType = uploadedFile.mimetype || clientContentType; 

    console.log(`API /api/upload-image (Req ID: ${reqId}): Processing file: ${actualOriginalName}, Type detected by formidable: ${uploadedFile.mimetype}, Type from client: ${clientContentType}. Using: ${fileType}`);

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing PDF: ${actualOriginalName} from formidable path: ${formidableTempFilePath}`);
      const data = new Uint8Array(fs.readFileSync(formidableTempFilePath));
      const pdfDocument = await pdfjsLib.getDocument(data).promise;
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF "${actualOriginalName}" loaded. Num pages: ${pdfDocument.numPages}`);
      const canvasFactory = new NodeCanvasFactory();

      for (let i = 1; i <= pdfDocument.numPages; i++) {
        let canvasAndContext: any = null; // Declare here to ensure it's in scope for finally
        try {
            const page = await pdfDocument.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); // Adjust scale as needed
            
            console.log(`API /api/upload-image (Req ID: ${reqId}): Processing page ${i} of "${actualOriginalName}". Viewport: ${viewport.width}x${viewport.height}`);
            
            canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
            
            const renderContext = {
              canvasContext: canvasAndContext.context,
              viewport: viewport,
              canvasFactory: canvasFactory,
            };
            
            await page.render(renderContext).promise;
            console.log(`API /api/upload-image (Req ID: ${reqId}): Page ${i} rendered to canvas.`);
            
            const imageBuffer = (canvasAndContext.canvas as unknown as Canvas).toBuffer('image/png');
            page.cleanup(); // Important to free memory used by the page
            
            const gridFsFilename = `${userId}_${Date.now()}_${path.parse(actualOriginalName).name.replace(/[^a-zA-Z0-9_.-]/g, '_')}_page_${i}.png`;
            const metadata = {
              originalName: `${actualOriginalName} (Page ${i})`,
              userId,
              uploadedAt: new Date().toISOString(),
              sourceContentType: 'application/pdf',
              convertedTo: 'image/png',
              pageNumber: i,
              reqId: reqId,
            };

            console.log(`API /api/upload-image (Req ID: ${reqId}): Uploading PDF page as "${gridFsFilename}"`);
            const uploadStream = bucket.openUploadStream(gridFsFilename, { contentType: 'image/png', metadata });
            
            await new Promise<void>((resolveStream, rejectStream) => {
              uploadStream.write(imageBuffer, (err) => {
                if (err) {
                  console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Write Error for PDF page ${gridFsFilename}:`, err);
                  rejectStream(new Error(`GridFS write error for ${gridFsFilename} (Req ID: ${reqId}): ${(err as Error).message}`));
                  return;
                }
                uploadStream.end((errEnd) => {
                  if (errEnd) {
                    console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream End Error for PDF page ${gridFsFilename}:`, errEnd);
                    rejectStream(new Error(`GridFS end error for ${gridFsFilename} (Req ID: ${reqId}): ${(errEnd as Error).message}`));
                    return;
                  }
                  console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished for PDF page: ${gridFsFilename}, ID: ${uploadStream.id}`);
                  results.push({ originalName: metadata.originalName, fileId: uploadStream.id.toString(), filename: gridFsFilename, pageNumber: i });
                  resolveStream();
                });
              });
            });
        } finally {
            if (canvasAndContext && canvasAndContext.canvas) {
                // canvasFactory.destroy(canvasAndContext); // Release canvas resources
                // console.log(`API /api/upload-image (Req ID: ${reqId}): Canvas resources for page ${i} destroyed.`);
                 // Attempt to destroy canvas to free memory if it exists
                 if (canvasAndContext.canvas) {
                    (canvasAndContext.canvas as unknown as Canvas).width = 0;
                    (canvasAndContext.canvas as unknown as Canvas).height = 0;
                    (canvasAndContext.canvas as any) = null; // Help GC
                    (canvasAndContext.context as any) = null; // Help GC
                    console.log(`API /api/upload-image (Req ID: ${reqId}): Canvas for page ${i} explicitly zeroed out.`);
                }
            }
        }
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF ${actualOriginalName} processed into ${results.length} page(s).`);

    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing Image: ${actualOriginalName} from formidable path ${formidableTempFilePath}`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
        reqId: reqId,
      };

      console.log(`API /api/upload-image (Req ID: ${reqId}): Uploading image "${imageFilename}" with contentType "${fileType}".`);
      const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
      const readable = fs.createReadStream(formidableTempFilePath); 

      await new Promise<void>((resolveStream, rejectStream) => {
        readable.pipe(uploadStream)
          .on('error', (err: MongoError) => { 
            console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for image ${imageFilename}:`, err);
            rejectStream(new Error(`GridFS upload error for ${imageFilename} (Req ID: ${reqId}): ${err.message}`));
          })
          .on('finish', () => {
            console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished for image: ${imageFilename}, ID: ${uploadStream.id}`);
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

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed. Results count: ${results.length}`);
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`\n--- !!! API /api/upload-image (Req ID: ${reqId}): UNHANDLED ERROR IN POST HANDLER !!! ---`);
    console.error(`Error Type: ${error.name}`);
    console.error(`Error Message: ${error.message}`);
    if (error.stack) {
        console.error(`Error Stack: ${error.stack.substring(0, 1000)}...`); // Log more of the stack
    }
    if (error.code) { 
        console.error(`Error Code: ${error.code}`);
    }
    if (error.cause) { 
        console.error(`Error Cause:`, error.cause);
    }
    console.error(`--- End of Unhandled Error Details (Req ID: ${reqId}) ---\n`);
    
    const responseMessage = error.message || `An unexpected critical error occurred during file upload. Req ID: ${reqId}.`;
    const errorKey = error.name || 'UNKNOWN_SERVER_ERROR';
    
    return NextResponse.json(
      { 
        message: `Server Error: ${responseMessage}. Check server logs for full details.`, 
        errorKey: errorKey,
        reqId: reqId,
        errorDetails: process.env.NODE_ENV === 'development' ? {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack?.substring(0, 500) + '... (truncated)',
            cause: error.cause ? JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause)).substring(0, 500) + '...' : undefined,
        } : undefined
      },
      { status: 500 } 
    );
  } finally {
    if (formidableTempFilePath && fs.existsSync(formidableTempFilePath)) {
      try {
        fs.unlinkSync(formidableTempFilePath);
        console.log(`API /api/upload-image (Req ID: ${reqId}): Formidable temp file ${formidableTempFilePath} deleted.`);
      } catch (unlinkError: any) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete formidable temp file ${formidableTempFilePath}. Error: ${unlinkError.message}`);
      }
    }
    console.log(`API /api/upload-image (Req ID: ${reqId}): Request processing finished.`);
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
