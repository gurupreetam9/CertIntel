
'use client';

import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UserImage } from './ImageGrid';
import { useEffect } from 'react';

interface ViewImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: UserImage | null;
}

export default function ViewImageModal({ isOpen, onClose, image }: ViewImageModalProps) {

  if (!image) {
    return null;
  }

  const imageSrc = `/api/images/${image.fileId}`;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(openStatus) => {
        if (!openStatus) onClose();
      }}
    >
      <DialogContent
        key={image.fileId ? `${image.fileId}-dialog-content` : 'dialog-empty'}
        className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden"
      >
        <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-4 shrink-0 border-b">
          <DialogTitle className="font-headline text-lg sm:text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
           <DialogDescription className="sr-only">
            A larger view of the image titled {image.originalName}. Image file ID is {image.fileId}.
          </DialogDescription>
        </DialogHeader>
        
        <div
          key={`${image.fileId}-image-stage`}
          // Added position: relative for NextImage with fill prop
          className="flex-1 min-h-0 w-full flex items-center justify-center overflow-auto p-2 sm:p-4 relative" 
        >
          <Image
            key={`${image.fileId}-modal-image`}
            src={imageSrc}
            alt={`View of ${image.originalName}`}
            fill // Use fill to make image cover the parent
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 80vw, 70vw" // Provide sizes for optimization with fill
            className="object-contain rounded-md" // object-contain ensures aspect ratio is maintained
            data-ai-hint={image.dataAiHint || 'full view image'}
            unoptimized={process.env.NODE_ENV === 'development'} 
            onLoad={(event) => {
              const target = event.target as HTMLImageElement;
              // console.log(`ViewImageModal: Next/Image onLoad for src: ${target.src}. Natural dimensions: ${target.naturalWidth}x${target.naturalHeight}.`);
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              console.error(`ViewImageModal: Next/Image onError event for src: ${target.src}. Error:`, e);
            }}
          />
        </div>

        <DialogFooter className="p-4 sm:p-6 pt-2 sm:pt-4 shrink-0 border-t">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
