
export const runtime = 'nodejs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Import pdfjs-dist and canvas for server-side PDF processing
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
// Specify the worker source for Node.js environment. Critical for pdfjs-dist v4+
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

import { createCanvas, type Canvas } from 'canvas';


interface CustomUploadedFile {
  filepath: string;
  originalFilename: string | null;
  mimetype: string | null;
  size: number;
}

interface CustomParsedForm {
  fields: { [key: string]: string | string[] };
  files: {
    [key: string]: CustomUploadedFile | undefined;
  };
}

// Revised form parsing using request.formData() for App Router
const parseFormRevised = async (req: NextRequest, reqId: string): Promise<CustomParsedForm> => {
  const formData = await req.formData();
  const fields: { [key: string]: string | string[] } = {};
  const filesOutput: CustomParsedForm['files'] = {};
  console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Starting formData processing.`);

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Processing file field '${key}', filename: '${value.name}'.`);
      const safeOriginalName = value.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const tempFileName = `nextjs_temp_${reqId}_${Date.now()}_${safeOriginalName}`;
      const tempFilePath = path.join(os.tmpdir(), tempFileName);

      try {
        const fileBuffer = Buffer.from(await value.arrayBuffer());
        await fsPromises.writeFile(tempFilePath, fileBuffer);

        filesOutput[key] = {
          filepath: tempFilePath,
          originalFilename: value.name,
          mimetype: value.type,
          size: value.size,
        };
        console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): File '${value.name}' saved to temp path '${tempFilePath}'.`);
      } catch (error: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Error writing file '${value.name}' to temp. Error: ${error.message}`);
        throw new Error(`Failed to write temporary file ${value.name}: ${error.message}`);
      }
    } else {
      console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Processing text field '${key}'.`);
      if (fields[key]) {
        if (Array.isArray(fields[key])) {
          (fields[key] as string[]).push(value);
        } else {
          fields[key] = [fields[key] as string, value];
        }
      } else {
        fields[key] = value;
      }
    }
  }
  console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Finished formData processing. Found ${Object.keys(filesOutput).length} file(s).`);
  return { fields, files: filesOutput };
};


export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);
  
  let tempFilePathsToDelete: string[] = [];

  // Outer-most catch for truly unexpected synchronous errors or issues with NextResponse itself
  try {
    // Main processing logic starts here
    try {
      let dbConnection;
      try {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Attempting DB connection...`);
        dbConnection = await connectToDb();
        if (!dbConnection || !dbConnection.bucket || !dbConnection.db) {
          console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error - connectToDb returned invalid structure.`);
          throw new Error('Server error: Database or GridFS bucket not initialized.');
        }
        console.log(`API /api/upload-image (Req ID: ${reqId}): DB connected, GridFS bucket obtained.`);
      } catch (dbError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error.`, { message: dbError.message, name: dbError.name });
        throw dbError; // Re-throw to be caught by the main error handler
      }
      
      const { bucket } = dbConnection;
      let fields: CustomParsedForm['fields'];
      let files: CustomParsedForm['files'];

      try {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Parsing form data using parseFormRevised...`);
        const parsedForm = await parseFormRevised(request, reqId);
        fields = parsedForm.fields;
        files = parsedForm.files;

        Object.values(files).forEach(fileDetail => {
          if (fileDetail?.filepath) tempFilePathsToDelete.push(fileDetail.filepath);
        });
        console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed. Fields:`, Object.keys(fields), `File keys:`, Object.keys(files));
      } catch (formError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error.`, { message: formError.message, name: formError.name, stack: formError.stack?.substring(0,300) });
        throw new Error(`Failed to parse form data: ${formError.message}`);
      }

      const userIdField = fields.userId;
      const userId = Array.isArray(userIdField) ? userIdField[0] : userIdField;
      
      if (!userId) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Missing userId. Fields:`, fields);
        // This return is fine, it's a controlled exit.
        return NextResponse.json({ message: 'Missing userId in form data.', errorKey: 'MISSING_USER_ID' }, { status: 400 });
      }
      
      const uploadedFileEntry = files.file;

      if (!uploadedFileEntry || !uploadedFileEntry.filepath) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field or filepath missing.`);
        return NextResponse.json({ message: 'No file uploaded or file path missing.', errorKey: 'NO_FILE_UPLOADED' }, { status: 400 });
      }
      
      const actualOriginalName = uploadedFileEntry.originalFilename || 'unknown_file';
      const tempFilePath = uploadedFileEntry.filepath; 
      const fileType = uploadedFileEntry.mimetype;

      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing file: ${actualOriginalName}, Type: ${fileType}, Temp path: ${tempFilePath}`);
      const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];

      if (fileType === 'application/pdf') {
        console.log(`API /api/upload-image (Req ID: ${reqId}): PDF detected. Processing with pdfjs-dist and canvas for ${actualOriginalName}.`);
        if (!fs.existsSync(tempFilePath)) {
          console.error(`API /api/upload-image (Req ID: ${reqId}): Temp PDF file not found at ${tempFilePath} before processing.`);
          throw new Error('Temporary PDF file disappeared before processing.');
        }
        const pdfData = new Uint8Array(await fsPromises.readFile(tempFilePath));
        console.log(`API /api/upload-image (Req ID: ${reqId}): PDF data read from temp file ${actualOriginalName}. Length: ${pdfData.length}`);
        
        let pdfDocument: any; // pdfjsLib.PDFDocumentProxy type
        try {
          console.log(`API /api/upload-image (Req ID: ${reqId}): Calling pdfjsLib.getDocument() for ${actualOriginalName}`);
          pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
          console.log(`API /api/upload-image (Req ID: ${reqId}): PDF ${actualOriginalName} loaded, ${pdfDocument.numPages} page(s).`);
        } catch (pdfLoadError: any) {
          console.error(`API /api/upload-image (Req ID: ${reqId}): Error loading PDF document '${actualOriginalName}' with pdfjsLib.getDocument:`, { message: pdfLoadError.message, name: pdfLoadError.name, stack: pdfLoadError.stack?.substring(0, 500) });
          throw new Error(`Failed to load PDF document '${actualOriginalName}': ${pdfLoadError.message}`);
        }

        for (let i = 1; i <= pdfDocument.numPages; i++) {
          const pageNumber = i;
          console.log(`API /api/upload-image (Req ID: ${reqId}): Processing PDF page ${pageNumber} of ${pdfDocument.numPages} for ${actualOriginalName}...`);
          let page: any; // pdfjsLib.PDFPageProxy type
          try {
            page = await pdfDocument.getPage(pageNumber);
            console.log(`API /api/upload-image (Req ID: ${reqId}): Page ${pageNumber} obtained for ${actualOriginalName}.`);
          } catch (getPageError: any) {
             console.error(`API /api/upload-image (Req ID: ${reqId}): Error getting page ${pageNumber} from PDF '${actualOriginalName}':`, { message: getPageError.message, name: getPageError.name });
             if (page && typeof page.cleanup === 'function') page.cleanup();
             throw new Error(`Failed to get page ${pageNumber} from PDF '${actualOriginalName}': ${getPageError.message}`);
          }
          
          const viewport = page.getViewport({ scale: 2.0 }); // Using scale 2.0 for better quality
          console.log(`API /api/upload-image (Req ID: ${reqId}): Viewport for page ${pageNumber} (${actualOriginalName}): width=${viewport.width}, height=${viewport.height}`);
          
          const canvas = createCanvas(viewport.width, viewport.height) as Canvas;
          const canvasContext = canvas.getContext('2d');
          console.log(`API /api/upload-image (Req ID: ${reqId}): Canvas created for page ${pageNumber} (${actualOriginalName}). Rendering...`);

          try {
            await page.render({ canvasContext, viewport }).promise;
            console.log(`API /api/upload-image (Req ID: ${reqId}): Page ${pageNumber} (${actualOriginalName}) rendered to canvas.`);
          } catch (renderError: any) {
            console.error(`API /api/upload-image (Req ID: ${reqId}): Error rendering page ${pageNumber} of PDF '${actualOriginalName}' to canvas:`, { message: renderError.message, name: renderError.name, stack: renderError.stack?.substring(0,500) });
            if (page && typeof page.cleanup === 'function') page.cleanup();
            throw new Error(`Failed to render PDF page ${pageNumber} of '${actualOriginalName}': ${renderError.message}`);
          }
          
          if (page && typeof page.cleanup === 'function') page.cleanup(); 
          console.log(`API /api/upload-image (Req ID: ${reqId}): Page ${pageNumber} (${actualOriginalName}) cleaned up. Converting canvas to PNG buffer...`);
          
          const pngBuffer = canvas.toBuffer('image/png');
          console.log(`API /api/upload-image (Req ID: ${reqId}): PNG buffer created for page ${pageNumber} (${actualOriginalName}). Length: ${pngBuffer.length}`);

          const basePdfNameSecure = path.basename(actualOriginalName, path.extname(actualOriginalName)).replace(/[^a-zA-Z0-9_.-]/g, '_');
          const imageFilename = `${userId}_${Date.now()}_${basePdfNameSecure}_page_${pageNumber}.png`;
          
          const metadata = {
            originalName: `${actualOriginalName} (Page ${pageNumber})`,
            userId,
            uploadedAt: new Date().toISOString(),
            sourceContentType: 'application/pdf',
            convertedTo: 'image/png',
            pageNumber,
            reqIdParent: reqId,
          };

          console.log(`API /api/upload-image (Req ID: ${reqId}): Creating GridFS upload stream for PDF page: ${imageFilename}`);
          const uploadStream = bucket.openUploadStream(imageFilename, { contentType: 'image/png', metadata });
          
          await new Promise<void>((resolveStream, rejectStream) => {
            uploadStream.on('error', (err: MongoError) => {
              console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for PDF page ${imageFilename}:`, { message: err.message, name: err.name, code: err.code, stack: err.stack?.substring(0,300) });
              rejectStream(new Error(`GridFS upload error for ${imageFilename}: ${err.message}`));
            });
            uploadStream.on('finish', () => {
              console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished for PDF page: ${imageFilename}, ID: ${uploadStream.id}.`);
              results.push({ originalName: metadata.originalName, fileId: uploadStream.id.toString(), filename: imageFilename, pageNumber });
              resolveStream();
            });
            console.log(`API /api/upload-image (Req ID: ${reqId}): Piping PNG buffer to GridFS for page ${pageNumber} (${actualOriginalName}).`);
            uploadStream.end(pngBuffer);
          });
        }
        if (pdfDocument && typeof pdfDocument.destroy === 'function') {
          await pdfDocument.destroy();
          console.log(`API /api/upload-image (Req ID: ${reqId}): PDF document ${actualOriginalName} destroyed.`);
        }
        console.log(`API /api/upload-image (Req ID: ${reqId}): Finished processing all PDF pages for '${actualOriginalName}'.`);

      } else if (fileType && fileType.startsWith('image/')) {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Image file type (${fileType}) detected. Uploading directly to GridFS for file '${actualOriginalName}'.`);
        const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
        const metadata = {
          originalName: actualOriginalName,
          userId,
          uploadedAt: new Date().toISOString(),
          sourceContentType: fileType,
          explicitContentType: fileType, // Keep this for clarity that it's the direct type
          reqIdParent: reqId,
        };

        try { 
          console.log(`API /api/upload-image (Req ID: ${reqId}): Creating GridFS upload stream for image: ${imageFilename}.`);
          const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
          console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS upload stream created with ID: ${uploadStream.id}. Reading from temp file: ${tempFilePath}`);
          
          if (!fs.existsSync(tempFilePath)) {
            console.error(`API /api/upload-image (Req ID: ${reqId}): Temp image file not found at ${tempFilePath} before GridFS upload.`);
            throw new Error('Temporary image file disappeared before GridFS upload.');
          }
          const readable = fs.createReadStream(tempFilePath);
          
          console.log(`API /api/upload-image (Req ID: ${reqId}): Starting to pipe readable stream to GridFS upload stream for ${imageFilename}.`);
          await new Promise<void>((resolveStream, rejectStream) => {
            readable.on('error', (err) => {
              console.error(`API /api/upload-image (Req ID: ${reqId}): Error reading temp file ${tempFilePath} for ${imageFilename}:`, { message: err.message, name: err.name, stack: err.stack?.substring(0,300) });
              rejectStream(new Error(`Error reading temporary file for ${imageFilename}: ${err.message}`));
            });
            uploadStream.on('error', (err: MongoError) => {
              console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for image ${imageFilename}:`, { message: err.message, name: err.name, code: err.code, stack: err.stack?.substring(0,300) });
              rejectStream(new Error(`GridFS upload error for ${imageFilename}: ${err.message}`));
            });
            uploadStream.on('finish', () => {
              console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished successfully for image: ${imageFilename}, ID: ${uploadStream.id}.`);
              results.push({ originalName: actualOriginalName, fileId: uploadStream.id.toString(), filename: imageFilename });
              resolveStream();
            });
            readable.pipe(uploadStream);
          });
          console.log(`API /api/upload-image (Req ID: ${reqId}): Finished piping to GridFS for ${imageFilename}.`);
        } catch (imageProcessingError: any) {
            console.error(`API /api/upload-image (Req ID: ${reqId}): Error during image processing/upload for '${actualOriginalName}':`, imageProcessingError.message, imageProcessingError.stack?.substring(0,500));
            throw new Error(`Failed during image processing for '${actualOriginalName}': ${imageProcessingError.message}`); // Re-throw
        }
      } else {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${actualOriginalName}. Temp path: ${tempFilePath}`);
        return NextResponse.json({ message: `Unsupported file type: ${fileType}. Please upload an image or PDF.`, errorKey: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
      }

      console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed file(s). Results count: ${results.length}.`);
      return NextResponse.json(results, { status: 201 });

    } catch (error: any) { // This is the primary catch block
      const errorReqId = reqId; 
      // Log more structured error information
      console.error(`API /api/upload-image (Req ID: ${errorReqId}): HANDLED ERROR IN POST HANDLER. Name: ${error.name}, Message: ${error.message}, Code: ${error.code || 'N/A'}.`);
      if (process.env.NODE_ENV === 'development') {
          const stack = error.stack || (error.cause && (error.cause as any).stack) || 'No stack available';
          console.error(`API /api/upload-image (Req ID: ${errorReqId}): Error stack: ${stack}`);
      }
      
      const errorMessageToClient = (error.message && typeof error.message === 'string') 
        ? error.message 
        : 'An internal server error occurred during file upload.';
      const errorKey = (error.name && typeof error.name === 'string') 
        ? error.name 
        : 'UNKNOWN_ERROR';

      return NextResponse.json(
        {
          message: `Server Error: ${errorMessageToClient}`,
          errorKey: errorKey,
          reqId: errorReqId,
        },
        { status: 500 }
      );
    } finally {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Entering finally block. Temp files to delete:`, tempFilePathsToDelete);
      for (const tempPath of tempFilePathsToDelete) {
          if (fs.existsSync(tempPath)) {
              try {
                  await fsPromises.unlink(tempPath);
                  console.log(`API /api/upload-image (Req ID: ${reqId}): Temp file ${tempPath} deleted.`);
              } catch (unlinkError: any) {
                  console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete temp file ${tempPath}. Error: ${unlinkError.message}`);
              }
          } else {
              console.log(`API /api/upload-image (Req ID: ${reqId}): Temp file ${tempPath} already deleted or never existed.`);
          }
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): Request processing finished (main try-finally).`);
    }
  } catch (superError: any) { // Catch for the outer-most try (critical failures)
    const criticalReqId = reqId || 'UNKNOWN_REQ_ID_CRITICAL';
    console.error(`API /api/upload-image (Req ID: ${criticalReqId}): CRITICAL FAILURE IN POST HANDLER (SUPER CATCH). Name: ${superError.name}, Message: ${superError.message}. Stack: ${superError.stack}`);
    
    // Fallback to a very simple JSON response if all else fails.
    return new Response(
        JSON.stringify({
            message: `Critical Server Error. Req ID: ${criticalReqId}. Details: ${superError.message || 'Unspecified critical error.'}`,
            errorKey: 'CRITICAL_SERVER_FAILURE',
            reqId: criticalReqId,
        }),
        { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' }
        }
    );
  }
}

export const config = {
  api: {
    bodyParser: false, // We are using request.formData(), so Next.js default bodyParser is not needed.
  },
};
    