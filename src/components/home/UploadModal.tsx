
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ImageUploader from './ImageUploader';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

interface UploadModalProps {
  trigger: React.ReactNode;
  user: User | null; 
}

// This is the type of data ImageUploader's onUploadComplete will provide
interface UploadedImageDetails {
  originalName: string;
  downloadURL: string;
  storagePath: string; // Full path in Firebase storage
}

export default function UploadModal({ trigger, user }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const handleUploadComplete = async (uploadedFiles: UploadedImageDetails[]) => {
    if (!user || uploadedFiles.length === 0) {
      if(uploadedFiles.length === 0 && user){
        // This case might occur if all uploads failed within ImageUploader
        // and onUploadComplete was called with an empty array.
        // ImageUploader should ideally show toasts for individual failures.
        console.log("handleUploadComplete called with no successful files.");
      }
      return;
    }

    const metadataToSave = uploadedFiles.map(file => ({
      originalName: file.originalName,
      storagePath: file.storagePath, // Use the correct storagePath
      downloadURL: file.downloadURL,
      userId: user.uid,
      timestamp: new Date().toISOString(),
    }));
    
    try {
      const response = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Future: Add Authorization header with Firebase ID token for security
          // 'Authorization': `Bearer ${await user.getIdToken()}` 
        },
        body: JSON.stringify(metadataToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save metadata to server.');
      }
      // Toast for successful metadata save is now handled more granularly by ImageUploader's upload results.
      // If all went well, ImageUploader already showed a success toast.
      // We could add a specific one here if metadata saving is a distinct step for the user.
      // For now, assume ImageUploader's feedback is sufficient.
      // toast({ title: 'Metadata Saved', description: 'Image metadata successfully saved.' });
      
      // Potentially close modal or refresh list here
      // setIsOpen(false); // Example: Close modal after successful metadata save for all files
    } catch (error: any) {
      console.error('Failed to save metadata:', error);
      toast({
        title: 'Metadata Save Failed',
        description: error.message || 'Could not save image metadata after upload. Images are in storage, but metadata may be missing.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Upload Images</DialogTitle>
          <DialogDescription>
            Select images from your device. Basic crop and resize options will be available soon.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-1 py-4">
          <ImageUploader onUploadComplete={handleUploadComplete} closeModal={() => setIsOpen(false)} />
        </div>
        <DialogFooter>
            <DialogClose asChild>
                <Button variant="outline">Close</Button>
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
