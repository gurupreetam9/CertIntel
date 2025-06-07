
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
// useToast removed as it's not used here directly anymore for generic upload completion

interface UploadModalProps {
  trigger: React.ReactNode;
  user: User | null;
  onUploadProcessed: () => void; // Renamed for clarity, this will trigger grid refresh
}

// This is the type of data ImageUploader's onUploadComplete will provide
interface UploadedImageDetailsToMongoDB {
  originalName: string;
  fileId: string; // MongoDB GridFS File ID
}

export default function UploadModal({ trigger, user, onUploadProcessed }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  // const { toast } = useToast(); // Removed if not used directly

  const handleUploadComplete = async (uploadedFiles: UploadedImageDetailsToMongoDB[]) => {
    if (!user) return;

    console.log('UploadModal: Images uploaded to MongoDB. Count:', uploadedFiles.length, 'Details:', uploadedFiles);
    
    if (uploadedFiles.length > 0) {
      console.log('UploadModal: Calling onUploadProcessed to refresh image grid.');
      onUploadProcessed(); // Call the passed-in function to refresh the grid
    } else {
      console.log("UploadModal: No files successfully uploaded in this batch, not refreshing grid.");
    }
    // Toast for completion is now handled within ImageUploader for batch summary
    // setIsOpen(false); // Optionally close modal, or let user do it
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Upload Images to Database</DialogTitle>
          <DialogDescription>
            Select images from your device to upload them directly to the database.
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
