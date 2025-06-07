
'use client';

import * as React from 'react';
import { useState, type ChangeEvent, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Camera, CheckCircle, FileUp, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface UploadedFile {
  file: File;
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  fileId?: string; // MongoDB GridFS File ID
}

interface ImageUploaderProps {
  onUploadComplete: (uploadedFiles: { originalName: string; fileId: string }[]) => void;
  closeModal: () => void;
}

async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as Data URI.'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

async function getDescriptionFromCustomAI(photoDataUri: string): Promise<{ description: string }> {
  const aiServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
  if (!aiServerBaseUrl) {
    const errorMsg = 'ImageUploader: NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot call custom AI.';
    console.error(errorMsg);
    throw new Error('Custom AI server URL is not configured.');
  }
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
      console.error(`ImageUploader: Custom AI server request failed with status ${response.status}: ${errorBodyText}`);
      throw new Error(`Custom AI server failed: ${response.statusText} - ${errorBodyText.substring(0, 200)}`);
    }

    const result = await response.json();
    console.log('ImageUploader: Custom AI server response:', result);
    if (!result.description) {
       throw new Error('Custom AI server response did not include a description.');
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
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { userId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles: UploadedFile[] = Array.from(files)
        .filter(file => file.type.startsWith('image/'))
        .map(file => ({
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'pending',
        }));
      setSelectedFiles(prev => [...prev, ...newFiles]);
      if(event.target) event.target.value = "";
    }
  };

  const triggerFileInput = (source: 'camera' | 'files') => {
    if (fileInputRef.current) {
      if (isMobile && source === 'camera') {
        fileInputRef.current.setAttribute('capture', 'environment');
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles(prev => {
      const fileToRemove = prev.find(f => f.file.name === fileName);
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter(f => f.file.name !== fileName);
    });
  };

  const handleUpload = async () => {
    if (!userId) {
      toast({ title: 'Authentication Error', description: 'User not authenticated. Please log in.', variant: 'destructive' });
      console.log('ImageUploader: Upload skipped, no user ID.');
      return;
    }

    const filesToUpload = selectedFiles.filter(f => f.status === 'pending' || f.status === 'error');
    if (filesToUpload.length === 0) {
      console.log('ImageUploader: No files in pending/error state to upload.');
      toast({ title: 'No New Files', description: 'No new files or files with errors to attempt uploading.'});
      return;
    }

    console.log(`ImageUploader: handleUpload called for MongoDB. Current isUploading before starting: ${isUploading}. Attempting to upload ${filesToUpload.length} files.`);
    setIsUploading(true);
    console.log('ImageUploader: isUploading state has been set to true.');

    const uploadPromises = filesToUpload.map(async (uploadedFile) => {
      setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, status: 'uploading', progress: 50, error: undefined } : f));
      console.log(`ImageUploader: Starting individual upload to MongoDB for: ${uploadedFile.file.name}`);

      try {
        const photoDataUri = await fileToDataUri(uploadedFile.file);

        console.log(`ImageUploader: Sending ${uploadedFile.file.name} to /api/upload-image`);
        const response = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoDataUri,
            originalName: uploadedFile.file.name,
            userId,
            contentType: uploadedFile.file.type,
          }),
        });

        const responseBody = await response.json().catch(() => {
            return { message: `Server returned non-JSON response (Status: ${response.status}). Check server logs.`, error: 'Invalid server response' };
        });

        if (!response.ok) {
          console.error(`ImageUploader: MongoDB upload failed for ${uploadedFile.file.name}. Status: ${response.status}`, responseBody);
          const errorMessage = responseBody.message || `Server error: ${response.status}. Check server logs.`;
          throw new Error(errorMessage);
        }

        const result = responseBody;
        console.log(`ImageUploader: MongoDB upload successful for: ${uploadedFile.file.name}. File ID: ${result.fileId}`);
        setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, status: 'success', progress: 100, fileId: result.fileId } : f));

        try {
          console.log(`ImageUploader: Calling getDescriptionFromCustomAI for ${uploadedFile.file.name}`);
          const descriptionResult = await getDescriptionFromCustomAI(photoDataUri);
          console.log(`ImageUploader: Custom AI Description for ${uploadedFile.file.name}: ${descriptionResult.description}`);
          toast({
            title: `AI: ${uploadedFile.file.name}`,
            description: descriptionResult.description.substring(0, 200) + (descriptionResult.description.length > 200 ? '...' : ''),
            duration: 7000,
          });
        } catch (customAiError: any) {
          console.error(`ImageUploader: Custom AI description failed for ${uploadedFile.file.name}:`, customAiError);
          toast({
            title: 'Custom AI Call Failed',
            description: `Could not get description for ${uploadedFile.file.name}. ${(customAiError.message || 'Unknown custom AI error')}`,
            variant: 'destructive',
            duration: 7000,
          });
        }

        return { originalName: uploadedFile.file.name, fileId: result.fileId };
      } catch (error: any) {
        console.error(`ImageUploader: Individual MongoDB upload error for file: ${uploadedFile.file.name}. Error:`, error.message, error);
        const errorMessage = error.message || 'Upload to MongoDB failed';
        setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, status: 'error', error: errorMessage, progress: 0 } : f));
        return null;
      }
    });

    try {
      console.log('ImageUploader: Waiting for all MongoDB upload promises to settle...');
      const results = await Promise.all(uploadPromises);
      console.log('ImageUploader: All MongoDB upload promises settled. Results:', JSON.stringify(results));

      const successfulUploads = results.filter(r => r !== null && r.fileId) as {originalName: string; fileId: string}[];
      const failedInThisBatchCount = filesToUpload.length - successfulUploads.length;

      console.log(`ImageUploader: Successful MongoDB uploads in this batch: ${successfulUploads.length}, Failed in this batch: ${failedInThisBatchCount}`);

      if (successfulUploads.length > 0) {
        console.log('ImageUploader: Calling onUploadComplete with successful MongoDB uploads:', successfulUploads);
        onUploadComplete(successfulUploads);
      }

      if (filesToUpload.length > 0) {
        if (successfulUploads.length > 0 && failedInThisBatchCount === 0) {
          toast({ title: 'Upload Complete', description: `${successfulUploads.length} image(s) uploaded to database successfully.` });
        } else if (successfulUploads.length > 0 && failedInThisBatchCount > 0) {
          toast({ title: 'Partial Upload', description: `${successfulUploads.length} image(s) uploaded to database. ${failedInThisBatchCount} failed. Check file errors.`, variant: 'default' });
        } else if (failedInThisBatchCount > 0 && successfulUploads.length === 0) {
           toast({ title: 'Upload Failed', description: `All ${failedInThisBatchCount} image(s) in this batch failed. Check file errors & server logs.`, variant: 'destructive' });
        }
      }

    } catch (allResultsError) {
      console.error('ImageUploader: Unexpected error during MongoDB Promise.all settlement or results processing:', allResultsError);
      toast({ title: 'Upload Processing Error', description: 'Unexpected error finalizing uploads. Some files may not have processed.', variant: 'destructive' });
    } finally {
      console.log(`ImageUploader: Entering finally block of MongoDB handleUpload. Current isUploading before set: ${isUploading}`);
      setIsUploading(false);
      console.log('ImageUploader: isUploading state has been set to false.');
    }
  };

  React.useEffect(() => {
    return () => {
      console.log("ImageUploader: Component unmounting, revoking object URLs.");
      selectedFiles.forEach(uploadedFile => {
        if (uploadedFile.previewUrl) {
          URL.revokeObjectURL(uploadedFile.previewUrl);
        }
      });
    };
  }, [selectedFiles]);


  return (
    <div className="space-y-6">
      <Input
          type="file"
          accept="image/*"
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
          <ImagePlus className="mr-2 h-5 w-5" /> Select Images
          <span className="sr-only">Select images to upload</span>
        </Button>
      )}


      {selectedFiles.length > 0 && (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          <h3 className="text-lg font-medium font-headline">Selected Images:</h3>
          {selectedFiles.map((uploadedFile) => (
            <Card key={uploadedFile.file.name + uploadedFile.file.lastModified} className="overflow-hidden shadow-md">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-md overflow-hidden shrink-0">
                   <Image src={uploadedFile.previewUrl} alt={`Preview ${uploadedFile.file.name}`} layout="fill" objectFit="cover" data-ai-hint="abstract photo" />
                </div>
                <div className="flex-grow space-y-2">
                  <p className="text-sm font-medium truncate" title={uploadedFile.file.name}>{uploadedFile.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>

                  {uploadedFile.status === 'pending' && (
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
                   {uploadedFile.status === 'uploading' && <p className="text-xs text-primary flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Uploading to DB...</p>}
                  {uploadedFile.status === 'success' && <p className="text-xs text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/>Uploaded to DB</p>}
                  {uploadedFile.status === 'error' && <p className="text-xs text-destructive flex items-center" title={uploadedFile.error}><AlertCircle className="w-3 h-3 mr-1"/>{uploadedFile.error}</p>}
                </div>
                {uploadedFile.status !== 'uploading' && (
                  <Button variant="ghost" size="icon" onClick={() => removeFile(uploadedFile.file.name)} className="shrink-0 text-muted-foreground hover:text-destructive">
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
          Upload {selectedFiles.filter(f => f.status === 'pending' || f.status === 'error').length} Pending Image(s)
        </Button>
      )}
    </div>
  );
}
