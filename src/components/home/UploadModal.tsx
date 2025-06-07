
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
interface UploadedImageDetailsToMongoDB {
  originalName: string;
  fileId: string; // MongoDB GridFS File ID
}

export default function UploadModal({ trigger, user }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // Updated to handle details from MongoDB upload
  const handleUploadComplete = async (uploadedFiles: UploadedImageDetailsToMongoDB[]) => {
    if (!user || uploadedFiles.length === 0) {
      if(uploadedFiles.length === 0 && user){
        console.log("UploadModal: handleUploadComplete called with no successful files to MongoDB.");
      }
      return;
    }

    console.log('UploadModal: Images uploaded to MongoDB. Details:', uploadedFiles);
    // For now, we just log. In the future, you might refresh an image list or perform other actions.
    // The metadata is now largely stored within GridFS itself or alongside it by the upload API.
    // The `/api/metadata` route might become obsolete or serve a different purpose for querying.

    // toast({ 
    //   title: 'Uploads Processed', 
    //   description: `${uploadedFiles.length} image(s) processed with MongoDB.` 
    // });
    
    // You might want to close the modal after uploads or let the user close it.
    // setIsOpen(false); 
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl">Upload Images to Database</DialogTitle>
          <DialogDescription>
            Select images from your device to upload them directly to the database.
            Please be aware of potential API body size limits for very large images.
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

    