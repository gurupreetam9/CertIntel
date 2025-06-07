
'use client';

import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UserImage } from './ImageGrid';
import { useEffect } from 'react';

interface ViewImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: UserImage | null;
}

export default function ViewImageModal({ isOpen, onClose, image }: ViewImageModalProps) {
  useEffect(() => {
    console.log('ViewImageModal: Render/Update. isOpen:', isOpen, 'Image prop ID:', image ? image.fileId : 'null');
  }, [isOpen, image]);

  if (!image) {
    if (isOpen) {
      console.warn('ViewImageModal: isOpen is true but image prop is null. Modal will not render content.');
    }
    return null;
  }

  const imageSrc = `/api/images/${image.fileId}`;
  console.log(`ViewImageModal: Constructed image source URL for ${image.originalName} (ID: ${image.fileId}): ${imageSrc}`);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(openStatus) => {
        console.log('ViewImageModal: Dialog onOpenChange triggered. New open status:', openStatus);
        if (!openStatus) onClose();
      }}
    >
      <DialogContent
        key={`${image.fileId}-dialog-content`}
        className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden" // No padding on DialogContent itself
      >
        <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-4 shrink-0 border-b">
          <DialogTitle className="font-headline text-lg sm:text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only"> {/* For accessibility, as requested by console warning */}
          A larger view of the image titled {image.originalName}.
        </DialogDescription>

        {/* This div is the main stage for the image. It should grow. It's also the relative parent. */}
        <div
          key={`${image.fileId}-image-stage`}
          className="flex-1 min-h-0 w-full relative overflow-hidden p-2 sm:p-4 bg-background" // Padding here for around the image
        >
          <Image
            key={`${image.fileId}-modal-image`}
            src={imageSrc}
            alt={`View of ${image.originalName}`}
            layout="fill"
            objectFit="contain" // This will scale the image down to fit, maintaining aspect ratio, and center it
            className="rounded-md" // Can add specific padding to image if needed, but parent has it now
            data-ai-hint={image.dataAiHint || 'full view image'}
            unoptimized={process.env.NODE_ENV === 'development'}
            onLoad={(event) => {
              const target = event.target as HTMLImageElement;
              console.log(`ViewImageModal: Next/Image onLoad for src: ${target.src}. Natural dimensions: ${target.naturalWidth}x${target.naturalHeight}`);
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
