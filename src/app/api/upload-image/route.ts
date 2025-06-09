
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { connectToDb } from '@/lib/mongodb';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import os from 'os';
import path from 'path';

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

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SUPPORTED_PDF_TYPE = 'application/pdf';

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);

  let tempFilePathsToDelete: string[] = [];
  let mainError: Error | null = null;

  try {
    let dbConnection;
    try {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Attempting DB connection...`);
      dbConnection = await connectToDb();
      if (!dbConnection || !dbConnection.bucket || !dbConnection.db) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error - connectToDb returned invalid structure.`);
        mainError = new Error('Server error: Database or GridFS bucket not initialized.');
        throw mainError;
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): DB connected, GridFS bucket obtained.`);
    } catch (dbError: any) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): DB Connection Error. Name: ${dbError.name}, Message: ${dbError.message}`);
      mainError = dbError;
      throw mainError;
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
      mainError = new Error(`Failed to parse form data: ${formError.message}`);
      throw mainError;
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

    const results: { originalName: string; fileId: string; filename: string; contentType: string; }[] = [];

    if (fileType === SUPPORTED_PDF_TYPE) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF file detected. Uploading directly to GridFS for file '${actualOriginalName}'.`);
      const pdfFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: SUPPORTED_PDF_TYPE, 
        explicitContentType: SUPPORTED_PDF_TYPE, 
        reqIdParent: reqId,
      };

      try {
        const uploadStream = bucket.openUploadStream(pdfFilename, { contentType: SUPPORTED_PDF_TYPE, metadata });
        const readable = fs.createReadStream(tempFilePath);

        await new Promise<void>((resolveStream, rejectStream) => {
          readable.on('error', (err) => {
            console.error(`API /api/upload-image (Req ID: ${reqId}): Error reading temp PDF file ${tempFilePath} for ${pdfFilename}. Name: ${err.name}, Message: ${err.message}`);
            rejectStream(new Error(`Error reading temporary PDF file: ${err.message}`));
          });
          uploadStream.on('error', (err: MongoError) => {
            console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for PDF ${pdfFilename}. Name: ${err.name}, Message: ${err.message}`);
            rejectStream(new Error(`GridFS upload error for PDF: ${err.message}`));
          });
          uploadStream.on('finish', () => {
            console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished successfully for PDF: ${pdfFilename}, ID: ${uploadStream.id}.`);
            results.push({ originalName: actualOriginalName, fileId: uploadStream.id.toString(), filename: pdfFilename, contentType: SUPPORTED_PDF_TYPE });
            resolveStream();
          });
          readable.pipe(uploadStream);
        });
      } catch (pdfProcessingError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Error during direct PDF processing/upload for '${actualOriginalName}'. Message: ${pdfProcessingError.message}`);
        mainError = new Error(`Failed during PDF processing for '${actualOriginalName}': ${pdfProcessingError.message}`);
        throw mainError;
      }
    }
    else if (fileType && SUPPORTED_IMAGE_TYPES.includes(fileType)) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Supported image file type (${fileType}) detected. Uploading directly to GridFS for file '${actualOriginalName}'.`);
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
        const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
        const readable = fs.createReadStream(tempFilePath);

        await new Promise<void>((resolveStream, rejectStream) => {
          readable.on('error', (err) => {
            console.error(`API /api/upload-image (Req ID: ${reqId}): Error reading temp file ${tempFilePath} for ${imageFilename}. Name: ${err.name}, Message: ${err.message}`);
            rejectStream(new Error(`Error reading temporary file: ${err.message}`));
          });
          uploadStream.on('error', (err: MongoError) => {
            console.error(`API /api/upload-image (Req ID: ${reqId}): GridFS Stream Error for image ${imageFilename}. Name: ${err.name}, Message: ${err.message}`);
            rejectStream(new Error(`GridFS upload error: ${err.message}`));
          });
          uploadStream.on('finish', () => {
            console.log(`API /api/upload-image (Req ID: ${reqId}): GridFS Upload finished successfully for image: ${imageFilename}, ID: ${uploadStream.id}.`);
            results.push({ originalName: actualOriginalName, fileId: uploadStream.id.toString(), filename: imageFilename, contentType: fileType });
            resolveStream();
          });
          readable.pipe(uploadStream);
        });
      } catch (imageProcessingError: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Error during direct image processing/upload for '${actualOriginalName}'. Message: ${imageProcessingError.message}`);
        mainError = new Error(`Failed during image processing for '${actualOriginalName}': ${imageProcessingError.message}`);
        throw mainError;
      }
    } else {
      console.warn(`API /api/upload-image (Req ID: ${reqId}): Unsupported file type: ${fileType} for file ${actualOriginalName}. Only image files and PDFs are supported.`);
      return NextResponse.json({ message: `Unsupported file type: ${fileType}. Please upload a supported image or PDF file.`, errorKey: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    }

    console.log(`API /api/upload-image (Req ID: ${reqId}): Successfully processed file(s). Results count: ${results.length}.`);
    return NextResponse.json(results, { status: 201 });
  } catch (error: any) {
    const caughtError = mainError || error;
    console.error(`API /api/upload-image (Req ID: ${reqId}): OUTER CATCH BLOCK. Name: ${caughtError.name}, Message: ${caughtError.message}`);

    if (process.env.NODE_ENV === 'development' && caughtError.stack) {
      console.error(`API /api/upload-image (Req ID: ${reqId}): Full error stack: ${caughtError.stack}`);
    }

    return NextResponse.json(
      {
        message: `Server Error: ${caughtError.message}`,
        errorKey: caughtError.name || 'UNKNOWN_PROCESSING_ERROR',
        reqId: reqId,
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temporary files from /tmp or wherever
    if (tempFilePathsToDelete.length > 0) {
      for (const filePath of tempFilePathsToDelete) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`API /api/upload-image (Req ID: ${reqId}): Temporary file deleted: ${filePath}`);
          }
        } catch (cleanupErr: unknown) {
          if (cleanupErr instanceof Error) {
            console.error(`Cleanup error: ${cleanupErr.message}`);
          } else {
            console.error('Cleanup error is not an Error instance:', cleanupErr);
          }
        }
      }
    }
  }
}

    