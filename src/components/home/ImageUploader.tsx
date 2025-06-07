
'use client';

import * as React from 'react';
import { useState, type ChangeEvent, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Camera, CheckCircle, FileUp, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { uploadFileToFirebase } from '@/lib/firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { generateImageDescription, type GenerateImageDescriptionOutput } from '@/ai/flows/generate-image-description';

interface UploadedFile {
  file: File;
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  downloadURL?: string;
  storagePath?: string;
}

interface ImageUploaderProps {
  onUploadComplete: (uploadedFiles: { originalName: string; downloadURL: string; storagePath: string }[]) => void;
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

export default function ImageUploader({ onUploadComplete, closeModal }: ImageUploaderProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSource, setUploadSource] = useState<'camera' | 'files' | null>(null);
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
    setUploadSource(source);
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
    
    console.log(`ImageUploader: handleUpload called. Current isUploading before starting: ${isUploading}. Attempting to upload ${filesToUpload.length} files.`);
    setIsUploading(true);
    console.log('ImageUploader: isUploading state has been set to true.');

    const uploadPromises = filesToUpload.map(async (uploadedFile) => {
      setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, status: 'uploading', progress: 0, error: undefined } : f));
      console.log(`ImageUploader: Starting individual upload for: ${uploadedFile.file.name}`);
      const filePath = `images/${userId}/${Date.now()}_${uploadedFile.file.name}`;
      try {
        const { downloadURL, filePath: returnedPath } = await uploadFileToFirebase(
          uploadedFile.file,
          filePath,
          (progress) => {
            setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, progress } : f));
          }
        );
        console.log(`ImageUploader: Individual upload successful for: ${uploadedFile.file.name}. URL: ${downloadURL}`);
        setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, status: 'success', progress: 100, downloadURL, storagePath: returnedPath } : f));
        
        // ---- AI Description Generation ----
        try {
          console.log(`ImageUploader: Converting ${uploadedFile.file.name} to data URI for AI...`);
          const dataUri = await fileToDataUri(uploadedFile.file);
          console.log(`ImageUploader: Calling generateImageDescription for ${uploadedFile.file.name}`);
          const descriptionResult: GenerateImageDescriptionOutput = await generateImageDescription({ photoDataUri: dataUri });
          console.log(`ImageUploader: AI Description for ${uploadedFile.file.name}: ${descriptionResult.description}`);
          toast({
            title: `AI Description: ${uploadedFile.file.name}`,
            description: descriptionResult.description.substring(0, 200) + (descriptionResult.description.length > 200 ? '...' : ''), // Truncate for toast
            duration: 7000, 
          });
        } catch (aiError: any) {
          console.error(`ImageUploader: AI description failed for ${uploadedFile.file.name}:`, aiError);
          toast({
            title: 'AI Description Failed',
            description: `Could not generate description for ${uploadedFile.file.name}. ${(aiError.message || 'Unknown AI error')}`,
            variant: 'destructive',
            duration: 7000,
          });
        }
        // ---- End AI Description Generation ----

        return { originalName: uploadedFile.file.name, downloadURL, storagePath: returnedPath };
      } catch (error: any) {
        console.error(`ImageUploader: Individual upload error for file: ${uploadedFile.file.name}. Error object:`, error);
        const errorMessage = error.friendlyMessage || error.message || 'Upload failed';
        setSelectedFiles(prev => prev.map(f => f.file.name === uploadedFile.file.name ? { ...f, status: 'error', error: errorMessage, progress: 0 } : f));
        return null;
      }
    });

    try {
      console.log('ImageUploader: Waiting for all upload promises to settle...');
      const results = await Promise.all(uploadPromises);
      console.log('ImageUploader: All upload promises settled. Results:', JSON.stringify(results)); 
      
      const successfulUploads = results.filter(r => r !== null && r.downloadURL && r.storagePath) as {originalName: string; downloadURL: string; storagePath: string}[];
      const failedInThisBatchCount = filesToUpload.length - successfulUploads.length;

      console.log(`ImageUploader: Successful uploads in this batch: ${successfulUploads.length}, Failed in this batch: ${failedInThisBatchCount}`);

      if (successfulUploads.length > 0) {
        console.log('ImageUploader: Calling onUploadComplete with successful uploads:', successfulUploads);
        onUploadComplete(successfulUploads);
      }

      if (filesToUpload.length > 0) { 
        if (successfulUploads.length > 0 && failedInThisBatchCount === 0) {
          toast({ title: 'Upload Complete', description: `${successfulUploads.length} image(s) uploaded successfully.` });
        } else if (successfulUploads.length > 0 && failedInThisBatchCount > 0) {
          toast({ title: 'Partial Upload', description: `${successfulUploads.length} image(s) uploaded. ${failedInThisBatchCount} failed. Check individual files for errors.`, variant: 'default' });
        } else if (failedInThisBatchCount > 0 && successfulUploads.length === 0) {
           toast({ title: 'Upload Failed', description: `All ${failedInThisBatchCount} image(s) attempted in this batch failed to upload. Check individual files for errors.`, variant: 'destructive' });
        }
      } else {
        console.log('ImageUploader: No files were attempted in this batch for toast summary.');
      }

    } catch (allResultsError) {
      console.error('ImageUploader: Unexpected error during Promise.all settlement or results processing:', allResultsError);
      toast({ title: 'Upload Processing Error', description: 'An unexpected error occurred while finalizing uploads. Some files may not have processed correctly.', variant: 'destructive' });
    } finally {
      console.log(`ImageUploader: Entering finally block of handleUpload. Current isUploading before set: ${isUploading}`);
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
                        <CardTitle className="text-xs font-normal">Image Editor (Coming Soon)</CardTitle>
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
                   {uploadedFile.status === 'uploading' && <p className="text-xs text-blue-600 flex items-center"><Loader2 className="w-3 h-3 mr-1 animate-spin"/>Uploading...</p>}
                  {uploadedFile.status === 'success' && <p className="text-xs text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/>Uploaded</p>}
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
