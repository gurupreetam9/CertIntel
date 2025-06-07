
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MongoError, ObjectId } from 'mongodb';
import { Readable } from 'stream';
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
      uploadDir: os.tmpdir(), // Use OS temporary directory for formidable uploads
      keepExtensions: true,
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

export async function POST(request: NextRequest) {
  const reqId = Math.random().toString(36).substring(2, 9);
  console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received.`);
  let tempPdfPath: string | undefined;
  const tempImageFiles: string[] = []; // To store paths of converted image files for cleanup

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
    tempPdfPath = uploadedFile.filepath; // formidable saves to a temp path

    const results: { originalName: string; fileId: string; filename: string; pageNumber?: number }[] = [];
    const fileType = uploadedFile.mimetype || clientContentType;

    if (fileType === 'application/pdf') {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing PDF: ${actualOriginalName} from path: ${tempPdfPath}`);
      
      const tempImageOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), `pdfimages-${reqId}-`));
      tempImageFiles.push(tempImageOutputDir); // Add main dir for cleanup

      const options = {
        format: 'png' as const, // Output format
        out_dir: tempImageOutputDir,
        out_prefix: path.basename(actualOriginalName, path.extname(actualOriginalName)) + '_page',
        page: null, // Convert all pages
        pngFile: true, // Ensure pngFile is used for format: 'png'
      };

      try {
        console.log(`API /api/upload-image (Req ID: ${reqId}): Calling pdfPoppler.convert for ${tempPdfPath}`);
        await pdfPoppler.convert(tempPdfPath, options);
        console.log(`API /api/upload-image (Req ID: ${reqId}): pdfPoppler.convert finished for ${actualOriginalName}. Checking output dir: ${tempImageOutputDir}`);
      } catch (pdfConvertError: any) {
         console.error(`API /api/upload-image (Req ID: ${reqId}): pdfPoppler conversion error for "${actualOriginalName}". Error:`, pdfConvertError);
         let errMsg = `Failed to convert PDF "${actualOriginalName}" (Req ID: ${reqId}).`;
         if (pdfConvertError.message) errMsg += ` Poppler error: ${pdfConvertError.message.substring(0, 200)}`;
         if (pdfConvertError.message && (pdfConvertError.message.includes('ENOENT') || pdfConvertError.message.toLowerCase().includes('poppler'))) {
            errMsg += " Ensure 'poppler-utils' (or Poppler binaries) are installed and in the system PATH.";
         }
         const specificPdfConvertError = new Error(errMsg);
         specificPdfConvertError.name = 'PdfConversionError';
         throw specificPdfConvertError;
      }
      
      const convertedImageFilenames = fs.readdirSync(tempImageOutputDir).filter(f => f.startsWith(options.out_prefix) && f.endsWith('.png'));
      console.log(`API /api/upload-image (Req ID: ${reqId}): Found ${convertedImageFilenames.length} converted image files.`);

      if (convertedImageFilenames.length === 0) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): No images were converted from PDF ${actualOriginalName}. Check Poppler installation and PDF content.`);
      }

      for (const imageFilename of convertedImageFilenames) {
        const imagePath = path.join(tempImageOutputDir, imageFilename);
        tempImageFiles.push(imagePath); // Add each image file for cleanup
        
        const pageNumberMatch = imageFilename.match(/_page-(\d+)\.png$/);
        const pageNumber = pageNumberMatch ? parseInt(pageNumberMatch[1], 10) : undefined;

        const gridFsFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '_')}_page_${pageNumber || 'unknown'}.png`;
        const metadata = {
          originalName: `${actualOriginalName} (Page ${pageNumber || 'N/A'})`,
          userId,
          uploadedAt: new Date().toISOString(),
          sourceContentType: 'application/pdf',
          convertedTo: 'image/png',
          pageNumber: pageNumber,
        };

        console.log(`GridFS (upload-image, Req ID: ${reqId}): Uploading PDF page as "${gridFsFilename}" from path ${imagePath}`);
        const uploadStream = bucket.openUploadStream(gridFsFilename, { contentType: 'image/png', metadata });
        const readable = fs.createReadStream(imagePath);

        await new Promise<void>((resolveStream, rejectStream) => {
          readable.pipe(uploadStream)
            .on('error', (err: MongoError) => { 
              console.error(`GridFS Stream Error for PDF page ${gridFsFilename} (Req ID: ${reqId}):`, err);
              rejectStream(new Error(`GridFS upload error for ${gridFsFilename} (Req ID: ${reqId}): ${err.message}`));
            })
            .on('finish', () => {
              console.log(`GridFS Upload finished for PDF page: ${gridFsFilename}, ID: ${uploadStream.id} (Req ID: ${reqId})`);
              results.push({ originalName: metadata.originalName, fileId: uploadStream.id.toString(), filename: gridFsFilename, pageNumber });
              resolveStream();
            });
        });
      }
      console.log(`API /api/upload-image (Req ID: ${reqId}): PDF ${actualOriginalName} processed into ${results.length} pages.`);

    } else if (fileType && fileType.startsWith('image/')) {
      console.log(`API /api/upload-image (Req ID: ${reqId}): Processing Image: ${actualOriginalName} from path ${tempPdfPath}`);
      const imageFilename = `${userId}_${Date.now()}_${actualOriginalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const metadata = {
        originalName: actualOriginalName,
        userId,
        uploadedAt: new Date().toISOString(),
        sourceContentType: fileType,
      };

      console.log(`GridFS (upload-image, Req ID: ${reqId}): Uploading image "${imageFilename}" with contentType "${fileType}".`);
      const uploadStream = bucket.openUploadStream(imageFilename, { contentType: fileType, metadata });
      const readable = fs.createReadStream(tempPdfPath); // Use the temp path from formidable

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
  } finally {
    // Cleanup temporary files
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      try {
        fs.unlinkSync(tempPdfPath);
        console.log(`API /api/upload-image (Req ID: ${reqId}): Temp PDF file ${tempPdfPath} deleted.`);
      } catch (unlinkError: any) {
        console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete temp PDF file ${tempPdfPath}. Error: ${unlinkError.message}`);
      }
    }
    for (const tempFile of tempImageFiles) {
      if (fs.existsSync(tempFile)) {
        try {
          const stats = fs.lstatSync(tempFile);
          if (stats.isDirectory()) {
            fs.rmSync(tempFile, { recursive: true, force: true });
            console.log(`API /api/upload-image (Req ID: ${reqId}): Temp image directory ${tempFile} deleted.`);
          } else {
            fs.unlinkSync(tempFile);
            console.log(`API /api/upload-image (Req ID: ${reqId}): Temp image file ${tempFile} deleted.`);
          }
        } catch (unlinkError: any) {
          console.warn(`API /api/upload-image (Req ID: ${reqId}): Could not delete temp file/dir ${tempFile}. Error: ${unlinkError.message}`);
        }
      }
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
