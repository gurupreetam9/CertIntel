
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import os from 'os';
import pdfPoppler from 'pdf-poppler';

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
  const pdfToImageConversionTempDirs: string[] = []; 

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
      console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error.`, { message: dbError.message, name: dbError.name, stack: dbError.stack?.substring(0,500) });
      throw dbError; // Re-throw to be caught by main handler
    }
    
    const { bucket } = dbConnection;
    let fields: formidable.Fields;
    let files: formidable.Files;

    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Parsing form data...`);
      const parsedForm = await parseForm(request);
      fields = parsedForm.fields;
      files = parsedForm.files;
      const uploadedFile = files.file ? ((files.file as formidable.File[])[0] as formidable.File) : null;
      console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed. Fields: ${Object.keys(fields).join(', ')}. File: ${uploadedFile ? uploadedFile.originalFilename : 'No file field'}`);
    } catch (formError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error.`, { message: formError.message, name: formError.name, stack: formError.stack?.substring(0,500) });
      const specificFormError = new Error(`Failed to parse form data (Req ID: ${reqId}): ${formError.message}`);
      specificFormError.name = 'FormParsingError';
      throw specificFormError; // Re-throw
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
      throw missingFieldsError; // Re-throw
    }

    const fileArray = files.file as formidable.File[] | undefined; 
    if (!fileArray || fileArray.length === 0) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field.`);
      const noFileError = new Error('No file uploaded.');
      noFileError.name = 'NoFileUploadedError';
      throw noFileError; // Re-throw
    }
    const uploadedFile = fileArray[0]; 
    const actualOriginalName = uploadedFile.originalFilename || originalNameFromField; 
    formidableTempFilePath = uploadedFile.filepath; // Keep track for cleanup

    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];
    const fileType = uploadedFile.mimetype || clientContentType; 

    console.log(`API /api/upload-image (Req ID: ${reqId}): Processing file: ${actualOriginalName}, Type detected by formidable: ${uploadedFile.mimetype}, Type from client: ${clientContentType}. Using: ${fileType}`);

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing PDF: ${actualOriginalName} from formidable path: ${formidableTempFilePath}`);
      
      // Create a unique temporary directory for this PDF's image outputs
      const tempImageOutputDirForThisPdf = fs.mkdtempSync(path.join(os.tmpdir(), `pdfimages-${reqId}-`));
      pdfToImageConversionTempDirs.push(tempImageOutputDirForThisPdf); // Keep track for cleanup

      const options: pdfPoppler.PdfPopConvertOptions = {
        format: 'png', // Convert to PNG
        out_dir: tempImageOutputDirForThisPdf,
        out_prefix: path.parse(actualOriginalName).name.replace(/[^a-zA-Z0-9_.-]/g, '_') + '_page', // Sanitize prefix
        page: null, // Process all pages
      };
      
      console.log(`API /api/upload-image (Req ID: ${reqId}): Poppler options prepared:`, options);

      try {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Calling pdfPoppler.convert for ${formidableTempFilePath}. Output dir: ${options.out_dir}, Prefix: ${options.out_prefix}`);
        await pdfPoppler.convert(formidableTempFilePath, options);
        console.log(`API /api/upload-image (Req ID: ${reqId}): pdfPoppler.convert finished for ${actualOriginalName}. Checking output dir: ${tempImageOutputDirForThisPdf}`);
      } catch (pdfConvertError: any) {
         console.error(`API /api/upload-image (Req ID: ${reqId}): pdfPoppler conversion FAILED for "${actualOriginalName}". Error object:`, pdfConvertError);
         let errMsg = `Failed to convert PDF "${actualOriginalName}" (Req ID: ${reqId}).`;
         if (pdfConvertError.message) errMsg += ` Poppler error: ${String(pdfConvertError.message).substring(0, 250)}`;
         if (pdfConvertError.stderr) errMsg += ` Stderr: ${String(pdfConvertError.stderr).substring(0, 250)}`;
         if (pdfConvertError.status) errMsg += ` Status: ${pdfConvertError.status}`;

         if (pdfConvertError.message && (
            String(pdfConvertError.message).toLowerCase().includes('enoent') || 
            String(pdfConvertError.message).toLowerCase().includes('pdftoppm: not found') || 
            String(pdfConvertError.message).toLowerCase().includes('command not found') ||
            (pdfConvertError.code && String(pdfConvertError.code).toLowerCase() === 'enoent')
          )) {
            errMsg += " CRITICAL: 'poppler-utils' (or Poppler command-line tools like pdftoppm) are likely NOT INSTALLED or not in the system's PATH. Please install them for your OS.";
         }
         const specificPdfConvertError = new Error(errMsg);
         specificPdfConvertError.name = 'PdfConversionError';
        (specificPdfConvertError as any).cause = pdfConvertError;
        (specificPdfConvertError as any).originalErrorName = pdfConvertError.name;
        (specificPdfConvertError as any).originalErrorCode = pdfConvertError.code;
        (specificPdfConvertError as any).originalStderr = pdfConvertError.stderr;
        (specificPdfConvertError as any).originalStatus = pdfConvertError.status;
         throw specificPdfConvertError; 
      }
      
      const convertedImageFilenames = fs.readdirSync(tempImageOutputDirForThisPdf).filter(f => f.startsWith(options.out_prefix!) && f.endsWith(`.${options.format}`));
      console.log(`API /api/upload-image (Req ID: ${reqId}): Found ${convertedImageFilenames.length} converted image file(s). Names: ${convertedImageFilenames.join(', ')}`);

      if (convertedImageFilenames.length === 0) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): No images were converted from PDF ${actualOriginalName}. This could be due to an empty/corrupt PDF or Poppler issue not throwing an error.`);
        // Optionally throw an error or return an empty array if this is considered a failure
      }

      for (const imageFilename of convertedImageFilenames) {
        const imagePath = path.join(tempImageOutputDirForThisPdf, imageFilename);
        
        const pageNumberMatch = imageFilename.match(/_page-(\d+)\.png$/i);
        const pageNumber = pageNumberMatch ? parseInt(pageNumberMatch[1], 10) : undefined;

        const gridFsFilename = `${userId}_${Date.now()}_${path.parse(actualOriginalName).name.replace(/[^a-zA-Z0-9_.-]/g, '_')}_page_${pageNumber || 'unknown'}.png`;
        const metadata = {
          originalName: `${actualOriginalName} (Page ${pageNumber || 'N/A'})`,
          userId,
          uploadedAt: new Date().toISOString(),
          sourceContentType: 'application/pdf', // Original type was PDF
          convertedTo: 'image/png', // Stored as PNG
          pageNumber: pageNumber,
          reqId: reqId, // Include request ID for traceability
        };

        console.log(`API /api/upload-image (Req ID: ${reqId}): Uploading PDF page as "${gridFsFilename}" from path ${imagePath}`);
        const uploadStream = bucket.openUploadStream(gridFsFilename, { contentType: 'image/png', metadata });
        const readable = fs.createReadStream(imagePath);

        await new Promise<void>((resolveStream, rejectStream) => {
          readable.pipe(uploadStream)
            .on('error', (err: MongoError) => { 
              console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for PDF page ${gridFsFilename}:`, err);
              rejectStream(new Error(`GridFS upload error for ${gridFsFilename} (Req ID: ${reqId}): ${err.message}`));
            })
            .on('finish', () => {
              console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished for PDF page: ${gridFsFilename}, ID: ${uploadStream.id}`);
              results.push({ originalName: metadata.originalName, fileId: uploadStream.id.toString(), filename: gridFsFilename, pageNumber });
              resolveStream();
            });
        });
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
        reqId: reqId, // Include request ID
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
      throw unsupportedFileTypeError; // Re-throw
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed. Results count: ${results.length}`);
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`\n--- !!! API /api/upload-image (Req ID: ${reqId}): UNHANDLED ERROR IN POST HANDLER !!! ---`);
    console.error(`Error Type: ${error.name}`);
    console.error(`Error Message: ${error.message}`);
    if (error.stack) {
        console.error(`Error Stack: ${error.stack}`);
    }
    if (error.code) { 
        console.error(`Error Code: ${error.code}`);
    }
    // Check for properties from the custom PdfConversionError
    if ((error as any).originalErrorName) console.error(`Original Error Name: ${(error as any).originalErrorName}`);
    if ((error as any).originalErrorCode) console.error(`Original Error Code: ${(error as any).originalErrorCode}`);
    if ((error as any).originalStderr) console.error(`Original Stderr: ${(error as any).originalStderr}`);
    if ((error as any).originalStatus) console.error(`Original Status: ${(error as any).originalStatus}`);
    if (error.cause) { 
        console.error(`Error Cause: ${JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause))}`); // More detailed cause logging
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
            stack: error.stack?.substring(0, 500) + '... (truncated)', // Include part of stack in dev
            originalErrorName: (error as any).originalErrorName,
            originalErrorCode: (error as any).originalErrorCode,
            originalStderr: (error as any).originalStderr,
            originalStatus: (error as any).originalStatus,
            cause: error.cause ? JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause)).substring(0, 500) + '...' : undefined,
        } : undefined
      },
      { status: 500 } 
    );
  } finally {
    // Cleanup formidable temporary file
    if (formidableTempFilePath && fs.existsSync(formidableTempFilePath)) {
      try {
        fs.unlinkSync(formidableTempFilePath);
        console.log(`API /api/upload-image (Req ID: ${reqId}): Formidable temp file ${formidableTempFilePath} deleted.`);
      } catch (unlinkError: any) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete formidable temp file ${formidableTempFilePath}. Error: ${unlinkError.message}`);
      }
    }
    // Cleanup pdf-poppler temporary image directories
    for (const tempDir of pdfToImageConversionTempDirs) {
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(`API /api/upload-image (Req ID: ${reqId}): Poppler temp output directory ${tempDir} and its contents deleted.`);
        } catch (rmError: any) {
          console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete poppler temp output directory ${tempDir}. Error: ${rmError.message}`);
        }
      }
    }
    console.log(`API /api/upload-image (Req ID: ${reqId}): Request processing finished.`);
  }
}

// Required for formidable to work correctly with Next.js API routes
export const config = {
  api: {
    bodyParser: false,
  },
};

    