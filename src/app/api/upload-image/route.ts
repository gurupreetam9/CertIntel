
export const runtime = 'nodejs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import FormData from 'form-data'; // For sending multipart/form-data to Python

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

const parseFormRevised = async (req: NextRequest, reqId: string): Promise<CustomParsedForm> => {
  console.log(`API /api/upload-image (Req ID: ${reqId}, parseFormRevised): Starting formData processing.`);
  const formData = await req.formData();
  const fields: { [key: string]: string | string[] } = {};
  const filesOutput: CustomParsedForm['files'] = {};
  

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
      console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error. Name: ${dbError.name}, Message: ${dbError.message}`);
      throw dbError; 
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
      console.error(`API /api/upload-image (Req ID: ${reqId}): Form Parsing Error. Name: ${formError.name}, Message: ${formError.message}`);
      throw new Error(`Failed to parse form data: ${formError.message}`);
    }

    const userIdField = fields.userId;
    const userId = Array.isArray(userIdField) ? userIdField[0] : userIdField;
    
    if (!userId) {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Missing userId. Fields:`, fields);
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
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF detected. Forwarding to Python server for conversion.`);
      const pythonApiFormData = new FormData();
      
      if (!fs.existsSync(tempFilePath)) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Temp PDF file not found at ${tempFilePath} before forwarding.`);
        throw new Error('Temporary PDF file disappeared before forwarding to Python service.');
      }
      pythonApiFormData.append('pdf_file', fs.createReadStream(tempFilePath), {
        filename: actualOriginalName, // The original filename for the stream
        contentType: 'application/pdf',
      });
      pythonApiFormData.append('userId', userId);
      pythonApiFormData.append('originalName', actualOriginalName); // Explicitly send originalName
      pythonApiFormData.append('reqId', reqId); // For tracing in Python logs

      const flaskServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
      if (!flaskServerBaseUrl) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot forward PDF.`);
        throw new Error('Python server URL for PDF conversion is not configured.');
      }
      const conversionEndpoint = `${flaskServerBaseUrl}/api/convert-pdf-to-images`;
      
      // Get headers from form-data instance, including boundary
      const headers = pythonApiFormData.getHeaders();
      console.log(`API /api/upload-image (Req ID: ${reqId}): Sending PDF to ${conversionEndpoint}. Request Headers:`, JSON.stringify(headers));


      let pythonResponse;
      try {
        pythonResponse = await fetch(conversionEndpoint, {
          method: 'POST',
          body: pythonApiFormData as any, // Type assertion for fetch body
          headers: headers, // Pass the headers generated by form-data
        });

        const pythonResponseText = await pythonResponse.text(); // Read as text first for better error inspection
        console.log(`API /api/upload-image (Req ID: ${reqId}): Python server response status: ${pythonResponse.status}. Raw text:`, pythonResponseText.substring(0, 500));

        if (!pythonResponse.ok) {
          let pyErrorMsg = `Python PDF conversion service failed with status ${pythonResponse.status}.`;
          try {
            const pyErrorJson = JSON.parse(pythonResponseText);
            pyErrorMsg = pyErrorJson.error || pyErrorMsg;
          } catch (e) {
            pyErrorMsg += ` Response: ${pythonResponseText.substring(0, 200)}`;
          }
          console.error(`API /api/upload-image (Req ID: ${reqId}): Error from Python service: ${pyErrorMsg}`);
          throw new Error(pyErrorMsg);
        }
        
        const pythonResult = JSON.parse(pythonResponseText);
        if (Array.isArray(pythonResult)) {
          results.push(...pythonResult);
        } else {
          console.warn(`API /api/upload-image (Req ID: ${reqId}): Python service returned non-array result for PDF:`, pythonResult);
          throw new Error('Received unexpected data format from PDF conversion service.');
        }
        console.log(`API /api/upload-image (Req ID: ${reqId}): PDF successfully processed by Python. Results count: ${results.length}.`);

      } catch (fetchError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Error fetching Python PDF conversion endpoint. Full error object:`, fetchError);
        throw new Error(`Failed to connect to PDF conversion service: ${fetchError.message}`);
      }

    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Image file type (${fileType}) detected. Uploading directly to GridFS for file '${actualOriginalName}'.`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
        explicitContentType: fileType, 
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
            console.error(`API /api/upload-image (Req ID: ${reqId}): Error reading temp file ${tempFilePath} for ${imageFilename}. Name: ${err.name}, Message: ${err.message}`);
            rejectStream(new Error(`Error reading temporary file for ${imageFilename}: ${err.message}`));
          });
          uploadStream.on('error', (err: MongoError) => {
            console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for image ${imageFilename}. Name: ${err.name}, Code: ${err.code}, Message: ${err.message}`);
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
          console.error(`API /api/upload-image (Req ID: ${reqId}): Error during direct image processing/upload for '${actualOriginalName}'. Name: ${imageProcessingError.name}, Message: ${imageProcessingError.message}`);
          throw new Error(`Failed during image processing for '${actualOriginalName}': ${imageProcessingError.message}`); 
      }
    } else {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${actualOriginalName}. Temp path: ${tempFilePath}`);
      return NextResponse.json({ message: `Unsupported file type: ${fileType}. Please upload an image or PDF.`, errorKey: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed file(s). Results count: ${results.length}.`);
    return NextResponse.json(results, { status: 201 });

  } catch (error: any) { // This is the primary catch block for processing logic
    console.error(`API /api/upload-image (Req ID: ${reqId}): HANDLED ERROR IN POST HANDLER. Name: ${error.name}, Message: ${error.message}, Code: ${error.code || 'N/A'}.`);
    if (process.env.NODE_ENV === 'development' && error.stack) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Error stack: ${error.stack.substring(0, 500)}...`);
    }
    
    const errorMessageToClient = (error.message && typeof error.message === 'string') 
      ? error.message 
      : 'An internal server error occurred during file upload.';
    const errorKey = (error.name && typeof error.name === 'string') 
      ? error.name 
      : 'UNKNOWN_PROCESSING_ERROR';

    return NextResponse.json(
      {
        message: `Server Error: ${errorMessageToClient}`,
        errorKey: errorKey,
        reqId: reqId, 
      },
      { status: 500 }
    );
  } finally {
    console.log(`API /api/upload-image (Req ID: ${reqId}): Entering finally block for temp file cleanup. Temp files:`, tempFilePathsToDelete);
    for (const tempPath of tempFilePathsToDelete) {
        if (fs.existsSync(tempPath)) {
            try {
                await fsPromises.unlink(tempPath);
                console.log(`API /api/upload-image (Req ID: ${reqId}): Temp file ${tempPath} deleted.`);
            } catch (unlinkError: any) {
                console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete temp file ${tempPath}. Error: ${unlinkError.message}`);
            }
        } else {
            console.log(`API /api/upload-image (Req ID: ${reqId}): Temp file ${tempPath} already deleted or never existed (could be due to earlier error).`);
        }
    }
    console.log(`API /api/upload-image (Req ID: ${reqId}): Request processing finished (main try-finally).`);
  }
}

// Ensure this export config is present and correct for formData() to work with App Router
export const config = {
  api: {
    bodyParser: false, 
  },
};
    
