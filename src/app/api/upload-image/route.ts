
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import { promises as fsPromises } from 'fs'; // For async file operations
import fs from 'fs'; // For sync operations like createReadStream and existsSync
import os from 'os';
import OriginalFormData from 'form-data'; 
import path from 'path';

// Import pdfjs-dist and canvas for server-side PDF processing
// Using the standard CJS build path for pdfjs-dist v4+
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
// Specify the worker source for Node.js environment. Critical for pdfjs-dist v3+
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
import { createCanvas, type Canvas } from 'canvas';

// Define interfaces for the structure returned by our custom form parser
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

// Helper to parse form data using request.formData() and save files to temp
const parseFormRevised = async (req: NextRequest, reqId: string): Promise<CustomParsedForm> => {
  const formData = await req.formData();
  const fields: { [key: string]: string | string[] } = {};
  const filesOutput: CustomParsedForm['files'] = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // It's a file
      const safeOriginalName = value.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const tempFileName = `formidable_${reqId}_${Date.now()}_${safeOriginalName}`;
      const tempFilePath = path.join(os.tmpdir(), tempFileName);

      try {
        const fileBuffer = Buffer.from(await value.arrayBuffer());
        await fsPromises.writeFile(tempFilePath, fileBuffer);

        filesOutput[key] = {
          filepath: tempFilePath,
          originalFilename: value.name, // Use original name here
          mimetype: value.type,
          size: value.size,
        };
         console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): File ${value.name} saved to temp path ${tempFilePath}`);
      } catch (error: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Error processing file ${value.name}. Error: ${error.message}`);
        // Decide if you want to throw or skip this file
        // For now, we'll skip adding it to filesOutput if writing fails
      }
    } else {
      // It's a field
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
  return { fields, files: filesOutput };
};


class NodeCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) {
        console.error(`NodeCanvasFactory: Invalid dimensions for canvas: ${width}x${height}. Using 1x1 instead.`);
        width = 1;
        height = 1;
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas: canvas as unknown as HTMLCanvasElement, // Cast to match expected type
      context: context as unknown as CanvasRenderingContext2D, // Cast to match expected type
    };
  }

  reset(canvasAndContext: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }, width: number, height: number) {
    if (canvasAndContext.canvas) {
      (canvasAndContext.canvas as unknown as Canvas).width = width;
      (canvasAndContext.canvas as unknown as Canvas).height = height;
    } else {
        console.warn("NodeCanvasFactory: canvas was null in reset, this shouldn't happen if create was called.");
    }
  }

  destroy(canvasAndContext: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }) {
    if (canvasAndContext.canvas) {
      // Zero out dimensions
      (canvasAndContext.canvas as unknown as Canvas).width = 0;
      (canvasAndContext.canvas as unknown as Canvas).height = 0;
    }
     // canvasAndContext.canvas = null; // Not needed with local scope in renderPage
     // canvasAndContext.context = null;
  }
}


export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);
  
  let tempFilePathsToDelete: string[] = []; // Keep track of temp files to delete

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
      throw dbError; 
    }
    
    const { bucket } = dbConnection;
    let fields: CustomParsedForm['fields'];
    let files: CustomParsedForm['files'];

    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Parsing form data...`);
      const parsedForm = await parseFormRevised(request, reqId);
      fields = parsedForm.fields;
      files = parsedForm.files;
      // Add all created temp file paths to cleanup list
      Object.values(files).forEach(file => {
        if (file?.filepath) tempFilePathsToDelete.push(file.filepath);
      });
      console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed successfully. Fields:`, Object.keys(fields), `Files:`, files.file ? files.file.originalFilename : 'No file field');
    } catch (formError: any) {
      if (formError instanceof NextResponse) {
        return formError;
      }
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error after awaiting parseFormRevised.`, { message: formError.message, name: formError.name, stack: formError.stack?.substring(0,300) });
      throw new Error(`Failed to parse form data: ${formError.message}`);
    }

    const userIdField = fields.userId;
    const originalNameField = fields.originalName; // This might be less reliable now

    const userId = Array.isArray(userIdField) ? userIdField[0] : userIdField;
    
    if (!userId) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Missing userId. Fields:`, fields);
      return NextResponse.json({ message: 'Missing userId in form data.', errorKey: 'MISSING_USER_ID' }, { status: 400 });
    }
    
    const uploadedFileEntry = files.file; // 'file' is the field name from client

    if (!uploadedFileEntry || !uploadedFileEntry.filepath) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): No file uploaded in 'file' field or filepath missing.`);
      return NextResponse.json({ message: 'No file uploaded or file path missing.', errorKey: 'NO_FILE_UPLOADED' }, { status: 400 });
    }
    
    const actualOriginalName = uploadedFileEntry.originalFilename || 'unknown_file';
    const formidableTempFilePath = uploadedFileEntry.filepath;
    const fileType = uploadedFileEntry.mimetype;

    console.log(`API /api/upload-image (Req ID: ${reqId}): Processing file: ${actualOriginalName}, Type: ${fileType}, Temp path: ${formidableTempFilePath}`);
    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF detected. Forwarding to Python server for conversion.`);
      const flaskServerUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
      if (!flaskServerUrl) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot forward PDF.`);
        throw new Error('Python server URL for PDF conversion is not configured.');
      }
      
      const pythonApiFormData = new OriginalFormData();
      const pdfFileStream = fs.createReadStream(formidableTempFilePath);
      pythonApiFormData.append('pdf_file', pdfFileStream, { filename: actualOriginalName, contentType: 'application/pdf' });
      pythonApiFormData.append('userId', userId);
      pythonApiFormData.append('originalName', actualOriginalName);

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
      }
    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Image file type (${fileType}) detected. Uploading directly to GridFS.`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
        explicitContentType: fileType,
        reqIdParent: reqId,
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
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) {
    console.error(`API /api/upload-image (Req ID: ${reqId}): UNHANDLED ERROR IN POST HANDLER. Name: ${error.name}, Message: ${error.message}.`);
    console.error(`API /api/upload-image (Req ID: ${reqId}): Error stack: ${error.stack ? error.stack.substring(0,1000) : 'No stack available'}`);
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json(
      {
        message: `Server Error: ${error.message || 'An unexpected error occurred during file upload.'}`,
        errorKey: error.name || 'UNKNOWN_SERVER_ERROR',
        reqId: reqId,
        errorDetails: error.toString(),
      },
      { status: 500 }
    );
  } finally {
    // Cleanup all temporary files created by parseFormRevised
    for (const tempPath of tempFilePathsToDelete) {
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
                console.log(`API /api/upload-image (Req ID: ${reqId}): Temp file ${tempPath} deleted.`);
            } catch (unlinkError: any) {
                console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete temp file ${tempPath}. Error: ${unlinkError.message}`);
            }
        }
    }
    console.log(`API /api/upload-image (Req ID: ${reqId}): Request processing finished.`);
  }
}

export const config = {
  api: {
    bodyParser: false, // Still false, as Next.js handles streaming for request.formData()
  },
};
