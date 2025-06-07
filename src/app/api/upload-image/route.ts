
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import formidable from 'formidable';
import fs from 'fs';
import os from 'os';
import OriginalFormData from 'form-data'; // For sending data to Python server
import path from 'path'; // For joining paths for temp files

// Helper to make formidable work with Next.js Edge/Node.js runtime
const parseForm = (req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false, // Allow only single file uploads for 'file' field
      uploadDir: os.tmpdir(), 
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      // filter: function ({ name, originalFilename, mimetype }) {
      //   // Ensure the upload is for the 'file' field and is either an image or PDF
      //   const isFileField = name === 'file';
      //   const isAllowedType = (mimetype && (mimetype.includes('image') || mimetype.includes('application/pdf'))) || false;
      //   return isFileField && isAllowedType;
      // }
    });

    form.parse(req as any, (err, fields, files) => {
      if (err) {
        console.error(`API /api/upload-image (parseForm): Formidable parsing error. Req ID from form context may not be available.`, {
          message: err.message,
          code: (err as any).code,
          httpCode: (err as any).httpCode,
          stack: err.stack?.substring(0, 300)
        });
        // Formidable errors often include an httpCode property.
        const statusCode = (err as any).httpCode || 400;
        const errorResponse = NextResponse.json(
            { message: `Form parsing error: ${err.message}`, errorKey: 'FORM_PARSE_ERROR' },
            { status: statusCode }
        );
        // Reject with a response object so it can be caught and returned by the main handler
        reject(errorResponse); 
        return;
      }
      resolve({ fields, files });
    });
  });
};

export async function POST(request: NextRequest) {
  // Generate a unique ID for this request for easier log tracking
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);
  
  let formidableTempFilePath: string | undefined;
  let tempDirForPdfPages: string | undefined; // For pdf-poppler

  try {
    let dbConnection;
    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Attempting DB connection...`);
      dbConnection = await connectToDb();
      if (!dbConnection || !dbConnection.bucket || !dbConnection.db) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error - connectToDb returned invalid structure.`);
        // This is a server configuration issue.
        throw new Error('Server error: Database or GridFS bucket not initialized after connectToDb call.');
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): DB connected, GridFS bucket obtained.`);
    } catch (dbError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error.`, { message: dbError.message, name: dbError.name });
      // Re-throw to be caught by the main try-catch, which sends a JSON response
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
      console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed successfully. Fields:`, Object.keys(fields), `Files:`, files.file ? (Array.isArray(files.file) ? files.file.map(f=>f.originalFilename) : files.file.originalFilename) : 'No file field');
    } catch (formError: any) {
      // If parseForm rejected with a NextResponse object
      if (formError instanceof NextResponse) {
        return formError;
      }
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error after awaiting parseForm.`, { message: formError.message, name: formError.name, stack: formError.stack?.substring(0,300) });
      throw new Error(`Failed to parse form data: ${formError.message}`);
    }

    const userIdField = fields.userId;
    const originalNameField = fields.originalName;

    const userId = Array.isArray(userIdField) ? userIdField[0] : userIdField;
    const originalNameFromField = Array.isArray(originalNameField) ? originalNameField[0] : originalNameField;

    if (!userId || !originalNameFromField) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Missing userId or originalName. UserID: ${userId}, OriginalName: ${originalNameFromField}`);
      return NextResponse.json({ message: 'Missing userId or originalName in form data.', errorKey: 'MISSING_FORM_FIELDS' }, { status: 400 });
    }

    const fileArray = files.file as formidable.File[] | undefined;
    if (!fileArray || fileArray.length === 0) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field.`);
      return NextResponse.json({ message: 'No file uploaded.', errorKey: 'NO_FILE_UPLOADED' }, { status: 400 });
    }
    const uploadedFile = fileArray[0]; // We only process the first file if multiple are sent for the 'file' field.
    
    // Use the filename from the formidable.File object first, fallback to originalName from form field
    const actualOriginalName = uploadedFile.originalFilename || originalNameFromField;
    formidableTempFilePath = uploadedFile.filepath; // This is where formidable stored the file

    if (!formidableTempFilePath) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Formidable temp file path is missing for ${actualOriginalName}. This should not happen.`);
        throw new Error('Internal server error: temporary file path not found after upload.');
    }

    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];
    const fileType = uploadedFile.mimetype;

    console.log(`API /api/upload-image (Req ID: ${reqId}): Processing file: ${actualOriginalName}, Type: ${fileType}, Temp path: ${formidableTempFilePath}`);

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF detected. Forwarding to Python server for conversion.`);
      const flaskServerUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
      if (!flaskServerUrl) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot forward PDF.`);
        throw new Error('Python server URL for PDF conversion is not configured.');
      }
      
      const pythonApiFormData = new OriginalFormData();
      // Create a read stream from the formidable temp file path
      const pdfFileStream = fs.createReadStream(formidableTempFilePath);
      pythonApiFormData.append('pdf_file', pdfFileStream, { filename: actualOriginalName, contentType: 'application/pdf' });
      pythonApiFormData.append('userId', userId);
      pythonApiFormData.append('originalName', actualOriginalName); // Pass the original name to Python

      const conversionEndpoint = `${flaskServerUrl}/api/convert-pdf-to-images`;
      console.log(`API /api/upload-image (Req ID: ${reqId}): Sending PDF to ${conversionEndpoint}`);
      
      let pythonResponse;
      try {
        pythonResponse = await fetch(conversionEndpoint, {
          method: 'POST',
          body: pythonApiFormData as any, 
          headers: pythonApiFormData.getHeaders(),
        });
      } catch (fetchError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Error fetching Python PDF conversion endpoint: ${fetchError.message}`);
        throw new Error(`Failed to connect to PDF conversion service: ${fetchError.message}`);
      }

      const pythonResponseData = await pythonResponse.json();

      if (!pythonResponse.ok) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Python server PDF conversion failed. Status: ${pythonResponse.status}, Response:`, pythonResponseData);
        throw new Error(pythonResponseData.error || `PDF conversion service failed with status ${pythonResponse.status}`);
      }

      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF conversion successful from Python server. Results:`, pythonResponseData);
      if (pythonResponseData.converted_files && Array.isArray(pythonResponseData.converted_files)) {
        results.push(...pythonResponseData.converted_files);
      } else {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Python server response did not contain a 'converted_files' array or it was empty.`);
        // It's possible a PDF had 0 pages or an issue, but Python server responded OK.
        // results will remain empty, which is fine if Python server handles this gracefully.
      }

    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Image file type (${fileType}) detected. Uploading directly to GridFS.`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType, // The original MIME type from upload
        explicitContentType: fileType, // Store it explicitly, useful for serving
        reqIdParent: reqId, // Link to the parent request ID
      };

      console.log(`API /api/upload-image (Req ID: ${reqId}): Creating GridFS upload stream for image: ${imageFilename} with metadata:`, metadata);
      const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
      console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS upload stream created with ID: ${uploadStream.id}. Reading from temp file: ${formidableTempFilePath}`);
      const readable = fs.createReadStream(formidableTempFilePath);
      
      console.log(`API /api/upload-image (Req ID: ${reqId}): Starting to pipe readable stream to GridFS upload stream for ${imageFilename}.`);
      await new Promise<void>((resolveStream, rejectStream) => {
        readable.on('error', (err) => {
          console.error(`API /api/upload-image (Req ID: ${reqId}): Error reading temp file ${formidableTempFilePath} for ${imageFilename}:`, err);
          rejectStream(new Error(`Error reading temporary file: ${err.message}`));
        });
        uploadStream.on('error', (err: MongoError) => {
          console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for image ${imageFilename}:`, err);
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

    } else {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${actualOriginalName}. Temp path: ${formidableTempFilePath}`);
      return NextResponse.json({ message: `Unsupported file type: ${fileType}. Please upload an image or PDF.`, errorKey: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed file(s). Results count: ${results.length}.`);
    if (results.length === 0 && fileType !== 'application/pdf') {
      // This case should ideally not be hit if the logic above is correct,
      // but as a safeguard if an image somehow didn't push to results.
      // For PDFs, it's possible results are empty if Python server found no pages but returned 200 OK.
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No results to return, though processing seemed to complete for non-PDF. This might indicate an issue.`);
       return NextResponse.json(
        { message: 'File processed but no output was generated. Check server logs.', results, reqId },
        { status: 200 } // Or 204 No Content, but 200 with empty results is also fine.
      );
    }
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`API /api/upload-image (Req ID: ${reqId}): UNHANDLED ERROR IN POST HANDLER. Name: ${error.name}, Message: ${error.message}.`);
    console.error(`API /api/upload-image (Req ID: ${reqId}): Error stack: ${error.stack ? error.stack.substring(0,1000) : 'No stack available'}`);
    // Check if the error is a response object (e.g. from a failed parseForm)
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json(
      {
        message: `Server Error: ${error.message || 'An unexpected error occurred during file upload.'}`,
        errorKey: error.name || 'UNKNOWN_SERVER_ERROR',
        reqId: reqId, // Include reqId in error response
        errorDetails: error.toString(), // Add more details
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
    // Cleanup pdf-poppler temporary directory (if it was created)
    if (tempDirForPdfPages && fs.existsSync(tempDirForPdfPages)) {
      try {
        fs.rmSync(tempDirForPdfPages, { recursive: true, force: true });
        console.log(`API /api/upload-image (Req ID: ${reqId}): PDF temporary page directory ${tempDirForPdfPages} deleted.`);
      } catch (rmError: any) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete PDF temporary page directory ${tempDirForPdfPages}. Error: ${rmError.message}`);
      }
    }
    console.log(`API /api/upload-image (Req ID: ${reqId}): Request processing finished.`);
  }
}

export const config = {
  api: {
    bodyParser: false, // Required for formidable to parse multipart/form-data
  },
};

