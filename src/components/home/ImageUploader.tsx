
'use client';

import * as React from 'react';
import { useState, type ChangeEvent, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Bot, Camera, CheckCircle, FileText, FileUp, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface UploadedFileEntry {
  file: File;
  previewUrl: string; // For images, actual preview. For PDFs, a generic icon or placeholder.
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  fileId?: string; // MongoDB GridFS File ID after upload
  isGeneratingDescription?: boolean;
  isPdf: boolean;
}

interface ImageUploaderProps {
  onUploadComplete: (uploadedFiles: { originalName: string; fileId: string }[]) => void;
  closeModal: () => void;
}

// This function is no longer needed if sending raw files
// async function fileToDataUri(file: File): Promise<string> { ... }

async function getDescriptionFromCustomAI(photoDataUri: string): Promise<{ description: string }> {
  const aiServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
  if (!aiServerBaseUrl) {
    const errorMsg = 'ImageUploader: NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot call custom AI.';
    console.error(errorMsg);
    throw new Error('Custom AI server URL is not configured. Please set NEXT_PUBLIC_FLASK_SERVER_URL in .env.local');
  }
  // This function would need to be adapted if your Flask server now expects a fileId instead of data URI
  // For now, assuming it's still for individual image description from data URI
  const aiEndpoint = `${aiServerBaseUrl}/describe-image`;

  console.log(`ImageUploader: Calling custom AI server at ${aiEndpoint} for description.`);
  try {
    const response = await fetch(aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ photoDataUri }),
    });

    if (!response.ok) {
      let errorBodyText = "Could not retrieve error body from AI server.";
      try {
        errorBodyText = await response.text();
      } catch (textError) {
        console.warn("ImageUploader: Could not parse error response body from AI server as text.", textError);
      }
      const fullErrorMessage = `Custom AI server request failed with status ${response.status}: ${errorBodyText.substring(0, 200)}`;
      console.error(`ImageUploader: ${fullErrorMessage}`);
      throw new Error(fullErrorMessage);
    }

    const result = await response.json();
    console.log('ImageUploader: Custom AI server response:', result);
    if (!result.description) {
       throw new Error('Custom AI server response did not include a "description" field.');
    }
    return result;
  } catch (error: any) {
    console.error('ImageUploader: Error during fetch to custom AI server:', error);
    let detailedMessage = 'Failed to get description from custom AI server.';
    if (error.message) {
      detailedMessage += ` Details: ${error.message}`;
    }
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        detailedMessage += ` This often means the AI server at "${aiEndpoint}" is not running, not reachable, or there's a CORS issue. Please check your AI server logs, ensure it's running, and that CORS is configured correctly if it's on a different origin/port.`;
    }
    throw new Error(detailedMessage);
  }
}

export default function ImageUploader({ onUploadComplete, closeModal }: ImageUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedFileEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { userId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFileEntries: UploadedFileEntry[] = Array.from(files)
        .map(file => {
          const isPdf = file.type === 'application/pdf';
          return {
            file,
            previewUrl: isPdf ? '' : URL.createObjectURL(file), // No direct preview for PDF here, backend will handle pages
            progress: 0,
            status: 'pending',
            isGeneratingDescription: false,
            isPdf,
          };
        });
      setSelectedFiles(prev => [...prev, ...newFileEntries]);
      if(event.target) event.target.value = ""; 
    }
  };

  const triggerFileInput = (source: 'camera' | 'files') => {
    if (fileInputRef.current) {
      if (isMobile && source === 'camera') {
        fileInputRef.current.setAttribute('capture', 'environment');
        fileInputRef.current.accept = 'image/*'; // Camera should only take images
      } else {
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.accept = 'image/*,application/pdf'; // File input allows both
      }
      fileInputRef.current.click();
    }
  };

  const removeFile = (identity: string) => { // identity can be file.name + file.lastModified
    setSelectedFiles(prev => {
      const fileToRemove = prev.find(f => f.file.name + f.file.lastModified === identity);
      if (fileToRemove?.previewUrl && !fileToRemove.isPdf) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter(f => f.file.name + f.file.lastModified !== identity);
    });
  };

  // AI Description button might need rethinking if we are uploading PDFs which become multiple images.
  // This function is kept for potential future use or adaptation.
  const handleGenerateDescription = async (targetFileEntry: UploadedFileEntry) => {
    if (targetFileEntry.isPdf || targetFileEntry.status !== 'success' || !targetFileEntry.fileId) {
      toast({ title: 'Cannot get description', description: 'AI description is only available for successfully uploaded single images.', variant: 'destructive'});
      return;
    }
    console.log(`ImageUploader: Attempting to generate AI description for ${targetFileEntry.file.name}`);
    // This needs direct image data or a way for Flask to get the image via fileId
    // For simplicity, if we were to keep this, we'd need to fetch the image data from /api/images/[fileId]
    // then convert to data URI to send to Flask. This is inefficient.
    // It's better if Flask can take a fileId. For now, this button may be less useful for PDF pages.
    // Let's disable or adapt it based on further requirements.
    // For now, I'll comment out the actual call and show a placeholder toast.
    toast({ title: 'AI Description', description: 'AI Description for individual pages to be implemented.' });

    /*
    setSelectedFiles(prev => prev.map(f => f.file.name === targetFileEntry.file.name ? { ...f, isGeneratingDescription: true } : f));
    try {
      // To make this work, we'd need to fetch the image data using targetFileEntry.fileId,
      // convert it to dataURI, then call getDescriptionFromCustomAI.
      // This is out of scope for the current PDF upload change.
      const photoDataUri = await fileToDataUri(targetFileEntry.file); // This is problematic if file is already uploaded
      const descriptionResult = await getDescriptionFromCustomAI(photoDataUri);
      toast({
        title: `AI Description: ${targetFileEntry.file.name}`,
        description: descriptionResult.description.substring(0, 200) + (descriptionResult.description.length > 200 ? '...' : ''),
        duration: 7000,
      });
    } catch (customAiError: any) {
      // ... error handling
    } finally {
      setSelectedFiles(prev => prev.map(f => f.file.name === targetFileEntry.file.name ? { ...f, isGeneratingDescription: false } : f));
    }
    */
  };


  const handleUpload = async () => {
    if (!userId) {
      toast({ title: 'Authentication Error', description: 'User not authenticated. Please log in.', variant: 'destructive' });
      return;
    }

    const filesToUpload = selectedFiles.filter(f => f.status === 'pending' || f.status === 'error');
    if (filesToUpload.length === 0) {
      toast({ title: 'No New Files', description: 'No new files or files with errors to attempt uploading.'});
      return;
    }

    setIsUploading(true);
    let allUploadedFileMetas: { originalName: string; fileId: string }[] = [];

    for (const fileEntry of filesToUpload) {
      setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'uploading', progress: 30, error: undefined } : f));
      
      const formData = new FormData();
      formData.append('file', fileEntry.file);
      formData.append('userId', userId);
      formData.append('originalName', fileEntry.file.name);
      formData.append('contentType', fileEntry.file.type);


      try {
        // Simulate progress for FormData
        setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, progress: 60 } : f));

        const response = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData, // Sending FormData
        });
        
        const responseBodyArray = await response.json().catch((err) => {
            console.error(`ImageUploader: Failed to parse JSON response for ${fileEntry.file.name}. Status: ${response.status}. Error:`, err);
            return [{ originalName: fileEntry.file.name, error: `Server returned non-JSON response (Status: ${response.status}).` }];
        });


        if (!response.ok) {
          const errorMsg = responseBodyArray[0]?.error || responseBodyArray[0]?.message || `Server error: ${response.status}.`;
          console.error(`ImageUploader: Upload failed for ${fileEntry.file.name}. Status: ${response.status}`, responseBodyArray);
          setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'error', error: errorMsg, progress: 0 } : f));
          continue; // Move to the next file
        }
        
        // responseBodyArray should be an array of {originalName, fileId, pageNumber?}
        const successfulUploadsForThisFile = responseBodyArray.filter((meta: any) => meta.fileId);
        allUploadedFileMetas.push(...successfulUploadsForThisFile);

        setSelectedFiles(prev => prev.map(f => {
          if (f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified) {
            // If it was a PDF that resulted in multiple pages, we mark the original PDF entry as 'success'
            // The actual fileIds are in successfulUploadsForThisFile
            return { ...f, status: 'success', progress: 100, fileId: successfulUploadsForThisFile.length > 0 ? successfulUploadsForThisFile[0].fileId : undefined };
          }
          return f;
        }));
        
      } catch (error: any) {
        console.error(`ImageUploader: Individual upload error for file: ${fileEntry.file.name}. Error:`, error.message, error);
        const errorMessage = error.message || 'Upload failed';
        setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'error', error: errorMessage, progress: 0 } : f));
      }
    } // end of for loop

    setIsUploading(false);

    if (allUploadedFileMetas.length > 0) {
      onUploadComplete(allUploadedFileMetas);
      toast({ title: 'Upload Process Complete', description: `${allUploadedFileMetas.length} image(s)/page(s) processed.` });
    } else if (filesToUpload.length > 0) {
      toast({ title: 'Upload Failed', description: 'No files were successfully uploaded in this batch.', variant: 'destructive' });
    }
  };

  React.useEffect(() => {
    return () => {
      selectedFiles.forEach(uploadedFile => {
        if (uploadedFile.previewUrl && !uploadedFile.isPdf) {
          URL.revokeObjectURL(uploadedFile.previewUrl);
        }
      });
    };
  }, [selectedFiles]);


  return (
    <div className="space-y-6">
      <Input
          type="file"
          accept="image/*,application/pdf" // Accept images and PDFs
          multiple
          onChange={handleFileChange}
          className="hidden"
          ref={fileInputRef}
        />
      {isMobile && selectedFiles.length === 0 && (
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button variant="outline" onClick={() => triggerFileInput('camera')} className="py-8 text-lg">
            <Camera className="mr-2 h-6 w-6" /> Use Camera
          </Button>
          <Button variant="outline" onClick={() => triggerFileInput('files')} className="py-8 text-lg">
            <FileUp className="mr-2 h-6 w-6" /> From Files
          </Button>
        </div>
      )}
      {(!isMobile || selectedFiles.length > 0) && (
        <Button variant="outline" onClick={() => triggerFileInput('files')} className="w-full py-6">
          <ImagePlus className="mr-2 h-5 w-5" /> Select Images or PDFs
          <span className="sr-only">Select images or PDFs to upload</span>
        </Button>
      )}


      {selectedFiles.length > 0 && (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          <h3 className="text-lg font-medium font-headline">Selected Files:</h3>
          {selectedFiles.map((uploadedFile) => (
            <Card key={uploadedFile.file.name + uploadedFile.file.lastModified} className="overflow-hidden shadow-md">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-md overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                   {uploadedFile.isPdf ? (
                     <FileText className="w-12 h-12 text-muted-foreground" />
                   ) : (
                     <Image src={uploadedFile.previewUrl} alt={`Preview ${uploadedFile.file.name}`} layout="fill" objectFit="cover" data-ai-hint="uploaded file" />
                   )}
                </div>
                <div className="flex-grow space-y-2">
                  <p className="text-sm font-medium truncate" title={uploadedFile.file.name}>{uploadedFile.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>

                  {uploadedFile.status === 'pending' && !uploadedFile.isPdf && (
                    <Card className="mt-2 bg-muted/50 border-dashed">
                      <CardHeader className="p-2">
                        <CardTitle className="text-xs font-normal">Image Editor (Placeholder)</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2 flex gap-2">
                        <Button variant="outline" size="sm" disabled>Crop</Button>
                        <Button variant="outline" size="sm" disabled>Resize</Button>
                      </CardContent>
                    </Card>
                  )}

                  {(uploadedFile.status === 'uploading' || (uploadedFile.status === 'success' && uploadedFile.progress < 100)) && (
                    <Progress value={uploadedFile.progress} className="w-full h-2 mt-1" />
                  )}
                   {uploadedFile.status === 'uploading' && <p className="text-xs text-primary flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Processing &amp; Uploading...</p>}
                  {uploadedFile.status === 'success' && (
                    <>
                      <p className="text-xs text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/>{uploadedFile.isPdf ? 'PDF processed &amp; pages uploaded' : 'Uploaded to DB'}</p>
                      {!uploadedFile.isPdf && ( // AI description button for non-PDFs for now
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-2"
                          onClick={() => handleGenerateDescription(uploadedFile)}
                          disabled={uploadedFile.isGeneratingDescription}
                        >
                          {uploadedFile.isGeneratingDescription ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Bot className="mr-2 h-4 w-4" />
                          )}
                          Get AI Description
                        </Button>
                      )}
                    </>
                  )}
                  {uploadedFile.status === 'error' && <p className="text-xs text-destructive flex items-center" title={uploadedFile.error}><AlertCircle className="w-3 h-3 mr-1"/>{uploadedFile.error}</p>}
                </div>
                {uploadedFile.status !== 'uploading' && !uploadedFile.isGeneratingDescription && (
                  <Button variant="ghost" size="icon" onClick={() => removeFile(uploadedFile.file.name + uploadedFile.file.lastModified)} className="shrink-0 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove {uploadedFile.file.name}</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <Button
          onClick={handleUpload}
          disabled={isUploading || !selectedFiles.some(f => f.status === 'pending' || f.status === 'error')}
          className="w-full"
        >
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-4 w-4" />
          )}
          Upload {selectedFiles.filter(f => f.status === 'pending' || f.status === 'error').length} Pending File(s)
        </Button>
      )}
    </div>
  );
}
