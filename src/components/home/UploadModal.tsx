
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

interface UploadModalProps {
  trigger: React.ReactNode;
  user: User | null;
  onUploadProcessed: () => void;
}

// This is the type of data ImageUploader's onUploadComplete will provide
// It's now an array because a PDF can result in multiple image files
interface UploadedFileMeta {
  originalName: string; // Could be original PDF name or image name, or page name
  fileId: string; // MongoDB GridFS File ID
  filename?: string; // Filename in GridFS
  pageNumber?: number; // If it was a PDF page
}

export default function UploadModal({ trigger, user, onUploadProcessed }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleUploadComplete = async (uploadedFiles: UploadedFileMeta[]) => {
    if (!user) return;

    console.log('UploadModal: Files processed by server. Count:', uploadedFiles.length, 'Details:', uploadedFiles);
    
    if (uploadedFiles.length > 0) {
      console.log('UploadModal: Calling onUploadProcessed to refresh image grid.');
      onUploadProcessed(); 
    } else {
      console.log("UploadModal: No files successfully processed in this batch, not refreshing grid.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Upload Files to Database</DialogTitle>
          <DialogDescription>
            Select images or PDF documents from your device. PDFs will be converted to images per page.
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
