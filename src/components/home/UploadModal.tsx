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
import type { User } from 'firebase/auth'; // Assuming User type is available
import { useToast } from '@/hooks/use-toast';

interface UploadModalProps {
  trigger: React.ReactNode;
  user: User | null; // Pass user for metadata
}

export default function UploadModal({ trigger, user }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const handleUploadComplete = async (uploadedFiles: {fileName: string; downloadURL: string; originalName: string}[]) => {
    if (!user || uploadedFiles.length === 0) return;

    const metadataToSave = uploadedFiles.map(file => ({
      originalName: file.originalName,
      storagePath: file.fileName, // This is actually the Firebase storage path
      downloadURL: file.downloadURL,
      userId: user.uid,
      timestamp: new Date().toISOString(),
    }));
    
    try {
      const response = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadataToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save metadata');
      }
      // toast({ title: 'Metadata Saved', description: 'Image metadata successfully saved.' });
      // Optionally update UI here, e.g. refresh image list
      // For now, modal can be closed or kept open for more uploads.
      // setIsOpen(false); // Uncomment to close modal after successful metadata save
    } catch (error: any) {
      console.error('Failed to save metadata:', error);
      toast({
        title: 'Metadata Save Failed',
        description: error.message || 'Could not save image metadata.',
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
