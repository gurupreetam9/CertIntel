
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
  previewUrl: string; 
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  fileId?: string; 
  isGeneratingDescription?: boolean;
  isPdf: boolean;
}

interface ImageUploaderProps {
  onUploadComplete: (uploadedFiles: { originalName: string; fileId: string }[]) => void;
  closeModal: () => void;
}

async function getDescriptionFromCustomAI(photoDataUri: string): Promise<{ description: string }> {
  const aiServerBaseUrl = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;
  if (!aiServerBaseUrl) {
    const errorMsg = 'ImageUploader: NEXT_PUBLIC_FLASK_SERVER_URL is not set. Cannot call custom AI.';
    console.error(errorMsg);
    throw new Error('Custom AI server URL is not configured. Please set NEXT_PUBLIC_FLASK_SERVER_URL in .env.local');
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
            previewUrl: isPdf ? '' : URL.createObjectURL(file),
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
        fileInputRef.current.accept = 'image/*'; 
      } else {
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.accept = 'image/*,application/pdf'; 
      }
      fileInputRef.current.click();
    }
  };

  const removeFile = (identity: string) => { 
    setSelectedFiles(prev => {
      const fileToRemove = prev.find(f => f.file.name + f.file.lastModified === identity);
      if (fileToRemove?.previewUrl && !fileToRemove.isPdf) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter(f => f.file.name + f.file.lastModified !== identity);
    });
  };

  const handleGenerateDescription = async (targetFileEntry: UploadedFileEntry) => {
    if (targetFileEntry.isPdf || targetFileEntry.status !== 'success' || !targetFileEntry.fileId) {
      toast({ title: 'Cannot get description', description: 'AI description is only available for successfully uploaded single images.', variant: 'destructive'});
      return;
    }
    console.log(`ImageUploader: Attempting to generate AI description for ${targetFileEntry.file.name}`);
    toast({ title: 'AI Description', description: 'AI Description for individual pages to be implemented.' });
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
        setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, progress: 60 } : f));
        
        const response = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData,
        });
        
        const responseText = await response.text();

        if (!response.ok) { 
          let errorMsg = `Server error: ${response.status}.`;
          let parsedErrorJson = null;
          try {
            parsedErrorJson = JSON.parse(responseText); 
            const serverErrorDetail = Array.isArray(parsedErrorJson) ? parsedErrorJson[0] : parsedErrorJson;
            errorMsg = serverErrorDetail?.message || serverErrorDetail?.error || errorMsg;
             if (parsedErrorJson?.reqId) {
              errorMsg += ` (Req ID: ${parsedErrorJson.reqId})`;
            }
          } catch (e) {
            console.warn(`ImageUploader: Server error response for ${fileEntry.file.name} was not valid JSON. Status: ${response.status}. Raw Response:`, responseText.substring(0,500));
            errorMsg = `Server error ${response.status}: ${responseText.substring(0, 150)}${responseText.length > 150 ? '...' : ''}`;
          }
          console.error(`ImageUploader: Upload failed for ${fileEntry.file.name}. Status: ${response.status}. Parsed/Raw Error:`, parsedErrorJson || responseText.substring(0,500));
          setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'error', error: errorMsg, progress: 0 } : f));
          continue; 
        }

        let responseBodyArray;
        try {
            responseBodyArray = JSON.parse(responseText);
        } catch (e) {
            console.error(`ImageUploader: Successfully received 2xx response for ${fileEntry.file.name}, but body was not valid JSON. Raw text:`, responseText.substring(0,500));
            setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'error', error: 'Server sent success status but invalid data format.', progress: 0 } : f));
            continue; 
        }
        
        const successfulUploadsForThisFile = (Array.isArray(responseBodyArray) ? responseBodyArray : [responseBodyArray]).filter((meta: any) => meta.fileId);
        allUploadedFileMetas.push(...successfulUploadsForThisFile);

        setSelectedFiles(prev => prev.map(f => {
          if (f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified) {
            return { ...f, status: 'success', progress: 100, fileId: successfulUploadsForThisFile.length > 0 ? successfulUploadsForThisFile[0].fileId : undefined };
          }
          return f;
        }));
        
      } catch (networkError: any) { 
        console.error(`ImageUploader: Network error during upload for file: ${fileEntry.file.name}. Error:`, networkError.message, networkError);
        const errorMessage = networkError.message || 'Upload failed due to a network issue.';
        setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'error', error: errorMessage, progress: 0 } : f));
      }
    } 

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
          accept="image/*,application/pdf" 
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
                     <Image 
                        src={uploadedFile.previewUrl} 
                        alt={`Preview ${uploadedFile.file.name}`} 
                        fill
                        sizes="(max-width: 640px) 96px, 128px"
                        className="object-cover"
                        data-ai-hint="uploaded file preview" 
                      />
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
                      {!uploadedFile.isPdf && ( 
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
