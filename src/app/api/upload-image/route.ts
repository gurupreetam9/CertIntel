
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import formidable from 'formidable';
import fs from 'fs';
import os from 'os';
import OriginalFormData from 'form-data'; // Renamed to avoid conflict if FormData is global

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
        throw new Error('Server error: Database or GridFS bucket not initialized after connectToDb call.');
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
    } catch (formError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error.`, { message: formError.message, name: formError.name });
      throw new Error(`Failed to parse form data: ${formError.message}`);
    }

    const userIdField = fields.userId;
    const originalNameField = fields.originalName;

    const userId = Array.isArray(userIdField) ? userIdField[0] : userIdField;
    const originalNameFromField = Array.isArray(originalNameField) ? originalNameField[0] : originalNameField;

    if (!userId || !originalNameFromField) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Missing userId or originalName. UserID: ${userId}, OriginalName: ${originalNameFromField}`);
      throw new Error('Missing userId or originalName in form data.');
    }

    const fileArray = files.file as formidable.File[] | undefined;
    if (!fileArray || fileArray.length === 0) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field.`);
      throw new Error('No file uploaded.');
    }
    const uploadedFile = fileArray[0];
    const actualOriginalName = uploadedFile.originalFilename || originalNameFromField;
    formidableTempFilePath = uploadedFile.filepath;

    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];
    const fileType = uploadedFile.mimetype;

    console.log(`API /api/upload-image (Req ID: ${reqId}): Processing file: ${actualOriginalName}, Type: ${fileType}`);

    if (fileType === 'application/pdf' && formidableTempFilePath) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF detected. Forwarding to Python server for conversion.`);
      const flaskServerUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
      if (!flaskServerUrl) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot forward PDF.`);
        throw new Error('Python server URL for PDF conversion is not configured.');
      }
      
      const pythonApiFormData = new OriginalFormData();
      pythonApiFormData.append('pdf_file', fs.createReadStream(formidableTempFilePath), actualOriginalName);
      pythonApiFormData.append('userId', userId);
      // Pass originalName explicitly as formidable might strip some parts for its temp file
      pythonApiFormData.append('originalName', actualOriginalName);


      const conversionEndpoint = `${flaskServerUrl}/api/convert-pdf-to-images`;
      console.log(`API /api/upload-image (Req ID: ${reqId}): Sending PDF to ${conversionEndpoint}`);
      
      let pythonResponse;
      try {
        // Using global fetch which is available in modern Node.js/Next.js environments
        pythonResponse = await fetch(conversionEndpoint, {
          method: 'POST',
          body: pythonApiFormData as any, // Type assertion needed as BodyInit doesn't perfectly match form-data type
          headers: pythonApiFormData.getHeaders(), // form-data lib handles Content-Type for multipart
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
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Python server response did not contain a 'converted_files' array.`);
        throw new Error('Received invalid response format from PDF conversion service.');
      }

    } else if (fileType && fileType.startsWith('image/') && formidableTempFilePath) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Image detected. Uploading directly to GridFS.`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
        reqId: reqId,
      };

      const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
      const readable = fs.createReadStream(formidableTempFilePath);

      await new Promise<void>((resolveStream, rejectStream) => {
        readable.pipe(uploadStream)
          .on('error', (err: MongoError) => {
            console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for image ${imageFilename}:`, err);
            rejectStream(new Error(`GridFS upload error for ${imageFilename}: ${err.message}`));
          })
          .on('finish', () => {
            console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished for image: ${imageFilename}, ID: ${uploadStream.id}`);
            results.push({ originalName: actualOriginalName, fileId: uploadStream.id.toString(), filename: imageFilename });
            resolveStream();
          });
      });
    } else {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${actualOriginalName} or temp file path missing.`);
      throw new Error(`Unsupported file type: ${fileType}. Please upload an image or PDF.`);
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed. Results count: ${results.length}`);
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`API /api/upload-image (Req ID: ${reqId}): UNHANDLED ERROR IN POST HANDLER. Name: ${error.name}, Message: ${error.message}.`);
    // Avoid sending full stack in production for security
    // console.error(`Full Stack: ${error.stack}`); 
    return NextResponse.json(
      {
        message: `Server Error: ${error.message || 'An unexpected error occurred.'}`,
        errorKey: error.name || 'UNKNOWN_SERVER_ERROR',
        reqId: reqId,
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
