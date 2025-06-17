
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
  isGeneratingDescription: boolean;
  isPdf: boolean;
  aiDescription?: string; // Added to store AI description
}

interface ImageUploaderProps {
  onUploadComplete: (uploadedFiles: { originalName: string; fileId: string }[]) => void;
  closeModal: () => void;
}

// Helper function to convert File to Data URI
const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
};

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
            aiDescription: undefined, // Initialize aiDescription
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
    const fileIdentity = targetFileEntry.file.name + targetFileEntry.file.lastModified;

    if (targetFileEntry.isPdf || targetFileEntry.status !== 'success' ) {
      toast({ title: 'Cannot get description', description: 'AI description is only available for successfully uploaded single images.', variant: 'destructive'});
      return;
    }

    setSelectedFiles(prev => prev.map(f =>
      f.file.name + f.file.lastModified === fileIdentity ? { ...f, isGeneratingDescription: true, aiDescription: undefined } : f // Reset description while fetching
    ));

    try {
      const photoDataUri = await fileToDataUri(targetFileEntry.file);
      console.log(`ImageUploader: Calling API '/api/ai/generate-description' for ${targetFileEntry.file.name}`);

      const response = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photoDataUri }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to generate description from API.');
      }

      if (result.description) {
        setSelectedFiles(prev => prev.map(f =>
          f.file.name + f.file.lastModified === fileIdentity ? { ...f, aiDescription: result.description } : f
        ));
        toast({
          title: `AI Description Loaded`,
          description: `Description for ${targetFileEntry.file.name} is now visible.`,
        });
      } else {
        throw new Error('API did not return a description.');
      }
    } catch (error: any) {
      console.error(`ImageUploader: Error generating AI description for ${targetFileEntry.file.name}:`, error);
      setSelectedFiles(prev => prev.map(f =>
        f.file.name + f.file.lastModified === fileIdentity ? { ...f, aiDescription: "Error fetching description." } : f
      ));
      toast({
        title: 'AI Description Failed',
        description: error.message || 'Could not generate description for the image.',
        variant: 'destructive',
      });
    } finally {
      setSelectedFiles(prev => prev.map(f =>
        f.file.name + f.file.lastModified === fileIdentity ? { ...f, isGeneratingDescription: false } : f
      ));
    }
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
      setSelectedFiles(prev => prev.map(f => f.file.name + f.file.lastModified === fileEntry.file.name + fileEntry.file.lastModified ? { ...f, status: 'uploading', progress: 30, error: undefined, aiDescription: undefined } : f));

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
          let errorMsg = `Upload failed. Server responded with status ${response.status}.`;
          let reqIdFromServer = null;

          try {
            const parsedError = JSON.parse(responseText);
            if (typeof parsedError === 'object' && parsedError !== null) {
              errorMsg = parsedError.message || errorMsg;
              reqIdFromServer = parsedError.reqId || null;
              if (reqIdFromServer && !errorMsg.includes('Req ID:')) {
                errorMsg += ` (Req ID: ${reqIdFromServer})`;
              }
            } else {
                errorMsg = responseText.length < 100 ? responseText : `Server error ${response.status}. Invalid error format received.`;
            }
          } catch (e) {
            console.warn(`ImageUploader: Server error response for ${fileEntry.file.name} was not valid JSON. Status: ${response.status}. Raw Response:`, responseText.substring(0,500));
            errorMsg = responseText.length < 200 ? `Server error ${response.status}: ${responseText}` : `Server error ${response.status}. See console for details.`;
          }
          console.error(`ImageUploader: Upload failed for ${fileEntry.file.name}. Status: ${response.status}. Error:`, errorMsg);
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
      toast({ title: 'Upload Process Complete', description: `${allUploadedFileMetas.length} file(s) processed.` });
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
              <CardContent className="p-4 flex flex-col gap-4"> {/* Main content is now column */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
                        <p className="text-xs text-green-600 flex items-center">
                          <CheckCircle className="w-3 h-3 mr-1"/>
                          {uploadedFile.isPdf ? 'PDF uploaded to DB' : 'Image uploaded to DB'}
                        </p>
                        {!uploadedFile.isPdf && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => handleGenerateDescription(uploadedFile)}
                            disabled={uploadedFile.isGeneratingDescription || uploadedFile.isPdf || uploadedFile.status !== 'success'}
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
                    <Button variant="ghost" size="icon" onClick={() => removeFile(uploadedFile.file.name + uploadedFile.file.lastModified)} className="shrink-0 text-muted-foreground hover:text-destructive sm:ml-auto"> {/* Added sm:ml-auto for alignment */}
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove {uploadedFile.file.name}</span>
                    </Button>
                  )}
                </div>
                {/* Display AI Description if available */}
                {uploadedFile.aiDescription && (
                  <div className="mt-2 p-3 bg-muted/40 rounded-md border text-sm text-foreground">
                    <h4 className="font-semibold mb-1 text-primary/90">AI Description:</h4>
                    <p className="whitespace-pre-wrap text-xs">{uploadedFile.aiDescription}</p>
                  </div>
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

