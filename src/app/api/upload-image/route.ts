
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
      maxFileSize: 50 * 1024 * 1024, 
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
      const uploadedFile = files.file ? ((files.file as formidable.File[])[0] as formidable.File) : null;
      console.log(`API /api/upload-image (Req ID: ${reqId}): Form data parsed. Fields: ${Object.keys(fields).join(', ')}. File: ${uploadedFile ? uploadedFile.originalFilename : 'No file field'}`);
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
      
      const tempImageOutputDirForThisPdf = fs.mkdtempSync(path.join(os.tmpdir(), `pdfimages-${reqId}-`));
      pdfToImageConversionTempDirs.push(tempImageOutputDirForThisPdf); 

      const options: pdfPoppler.PdfPopConvertOptions = {
        format: 'png', 
        out_dir: tempImageOutputDirForThisPdf,
        out_prefix: path.parse(actualOriginalName).name.replace(/[^a-zA-Z0-9_.-]/g, '_') + '_page', 
        page: null, 
      };
      
      console.log(`API /api/upload-image (Req ID: ${reqId}): Poppler options prepared:`, options);

      try {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Calling pdfPoppler.convert for ${formidableTempFilePath}. Output dir: ${options.out_dir}, Prefix: ${options.out_prefix}`);
        await pdfPoppler.convert(formidableTempFilePath, options);
        console.log(`API /api/upload-image (Req ID: ${reqId}): pdfPoppler.convert finished for ${actualOriginalName}. Checking output dir: ${tempImageOutputDirForThisPdf}`);
      } catch (pdfConvertError: any) {
         console.error(`API /api/upload-image (Req ID: ${reqId}): pdfPoppler conversion FAILED for "${actualOriginalName}". Error:`, {
           message: pdfConvertError.message,
           stack: pdfConvertError.stack,
           name: pdfConvertError.name,
           // Include any other relevant properties from pdfConvertError if available
           ...(pdfConvertError.stderr && { stderr: pdfConvertError.stderr }),
           ...(pdfConvertError.status && { status: pdfConvertError.status }),
         });
         let errMsg = `Failed to convert PDF "${actualOriginalName}" (Req ID: ${reqId}).`;
         if (pdfConvertError.message) errMsg += ` Poppler error: ${pdfConvertError.message.substring(0, 250)}`;
         // More specific check for Poppler not found
         if (pdfConvertError.message && (pdfConvertError.message.toLowerCase().includes('enoent') || pdfConvertError.message.toLowerCase().includes('pdftoppm: not found') || pdfConvertError.message.toLowerCase().includes('command not found'))) {
            errMsg += " CRITICAL: 'poppler-utils' (or Poppler command-line tools like pdftoppm) are likely NOT INSTALLED or not in the system's PATH. Please install them for your OS.";
         }
         const specificPdfConvertError = new Error(errMsg);
         specificPdfConvertError.name = 'PdfConversionError';
         throw specificPdfConvertError; 
      }
      
      const convertedImageFilenames = fs.readdirSync(tempImageOutputDirForThisPdf).filter(f => f.startsWith(options.out_prefix!) && f.endsWith(`.${options.format}`));
      console.log(`API /api/upload-image (Req ID: ${reqId}): Found ${convertedImageFilenames.length} converted image file(s). Names: ${convertedImageFilenames.join(', ')}`);

      if (convertedImageFilenames.length === 0) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): No images were converted from PDF ${actualOriginalName}. This could be due to an empty/corrupt PDF or Poppler issue not throwing an error.`);
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
          sourceContentType: 'application/pdf',
          convertedTo: 'image/png',
          pageNumber: pageNumber,
          reqId: reqId, 
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
        console.error(`Error Stack: ${error.stack}`);
    }
    if (error.code) { // For errors with a 'code' property, like system errors
        console.error(`Error Code: ${error.code}`);
    }
    if (error.cause) { // If the error has a 'cause'
        console.error(`Error Cause: ${JSON.stringify(error.cause, null, 2)}`);
    }
    console.error(`--- End of Unhandled Error Details (Req ID: ${reqId}) ---\n`);
    
    const responseMessage = error.message || 'An unexpected critical error occurred during file upload.';
    const errorKey = error.name || 'UNKNOWN_SERVER_ERROR';
    const errorDetails = { // For client consumption
        message: error.message, // Keep original message for client
        name: error.name,
        // Stack trace should generally not be sent to client in production for security
        stack: process.env.NODE_ENV === 'development' ? error.stack : 'Stack trace hidden in production.',
        reqId: reqId,
    };

    return NextResponse.json(
      { 
        message: `Server Error (Req ID: ${reqId}): ${responseMessage}. Check server logs for full details.`, 
        errorKey: errorKey, 
        details: errorDetails 
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

export const config = {
  api: {
    bodyParser: false,
  },
};

    