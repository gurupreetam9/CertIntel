'use client';

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

interface UploadedFile {
  file: File;
  previewUrl: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  downloadURL?: string;
}

interface ImageUploaderProps {
  onUploadComplete: (uploadedFiles: {fileName: string; downloadURL: string; originalName: string }[]) => void;
  closeModal: () => void;
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
    setSelectedFiles(prev => prev.filter(f => f.file.name !== fileName));
  };

  const handleUpload = async () => {
    if (!userId || selectedFiles.length === 0) return;

    setIsUploading(true);
    const uploadPromises = selectedFiles.map(async (uploadedFile, index) => {
      if (uploadedFile.status === 'success') return { ...uploadedFile, originalName: uploadedFile.file.name }; // Already uploaded
      
      setSelectedFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'uploading', progress: 0 } : f));
      
      const filePath = `images/${userId}/${Date.now()}_${uploadedFile.file.name}`;
      try {
        const { downloadURL } = await uploadFileToFirebase(
          uploadedFile.file,
          filePath,
          (progress) => {
            setSelectedFiles(prev => prev.map((f, i) => i === index ? { ...f, progress } : f));
          }
        );
        setSelectedFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'success', progress: 100, downloadURL } : f));
        return { fileName: uploadedFile.file.name, downloadURL, originalName: uploadedFile.file.name };
      } catch (error: any) {
        console.error('Upload error:', error);
        setSelectedFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: error.message || 'Upload failed' } : f));
        return null; // Indicate failure
      }
    });

    const results = await Promise.all(uploadPromises);
    setIsUploading(false);

    const successfulUploads = results.filter(r => r && r.downloadURL) as {fileName: string; downloadURL: string, originalName: string}[];
    
    if (successfulUploads.length > 0) {
      onUploadComplete(successfulUploads);
      toast({ title: 'Upload Successful', description: `${successfulUploads.length} image(s) uploaded.` });
      if (successfulUploads.length === selectedFiles.length) { // All successful
         // closeModal(); // Decided against auto-close to allow user to review
      }
    }
    if (successfulUploads.length < selectedFiles.length) {
        toast({ title: 'Partial Upload Failure', description: 'Some images could not be uploaded.', variant: 'destructive' });
    }
  };

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
          {selectedFiles.map((uploadedFile, index) => (
            <Card key={index} className="overflow-hidden shadow-md">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-md overflow-hidden shrink-0">
                   <Image src={uploadedFile.previewUrl} alt={`Preview ${uploadedFile.file.name}`} layout="fill" objectFit="cover" data-ai-hint="abstract photo" />
                </div>
                <div className="flex-grow space-y-2">
                  <p className="text-sm font-medium truncate" title={uploadedFile.file.name}>{uploadedFile.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  
                  {/* Placeholder for Crop/Resize UI */}
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
                  
                  {(uploadedFile.status === 'uploading' || uploadedFile.status === 'success') && (
                    <Progress value={uploadedFile.progress} className="w-full h-2 mt-1" />
                  )}
                  {uploadedFile.status === 'success' && <p className="text-xs text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/>Uploaded</p>}
                  {uploadedFile.status === 'error' && <p className="text-xs text-destructive flex items-center"><AlertCircle className="w-3 h-3 mr-1"/>{uploadedFile.error}</p>}
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
        <Button onClick={handleUpload} disabled={isUploading || !selectedFiles.some(f => f.status === 'pending')} className="w-full">
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-4 w-4" />
          )}
          Upload {selectedFiles.filter(f => f.status === 'pending').length} Image(s)
        </Button>
      )}
    </div>
  );
}
