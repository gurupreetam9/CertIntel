
'use client';

import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UserImage } from './ImageGrid'; 

interface ViewImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: UserImage | null;
}

export default function ViewImageModal({ isOpen, onClose, image }: ViewImageModalProps) {
  console.log('ViewImageModal: Render/Update. isOpen:', isOpen, 'Image prop ID:', image ? image.fileId : 'null');

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
        key={`${image.fileId}-dialog`} // Force re-mount of content if image changes
        className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6"
      >
        <DialogHeader className="pb-2 sm:pb-4 shrink-0">
          <DialogTitle className="font-headline text-lg sm:text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
          <DialogDescription className="sr-only"> {/* For accessibility */}
            A larger view of the image titled {image.originalName}.
          </DialogDescription>
        </DialogHeader>
        
        {/* This div is the main stage for the image. It should grow and be the relative parent for the Image component. */}
        <div 
          key={`${image.fileId}-image-stage`} // Force re-mount of stage if image changes
          className="flex-1 min-h-0 relative w-full overflow-hidden" // Ensure it takes width and can grow vertically
        >
          <Image
            key={`${image.fileId}-modal-image`}
            src={imageSrc}
            alt={`View of ${image.originalName}`}
            layout="fill" 
            objectFit="contain" 
            className="rounded-md" 
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
            data-ai-hint={image.dataAiHint || 'full view image'}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              console.error(`ViewImageModal: Next/Image onError event for src: ${target.src}. Natural width: ${target.naturalWidth}. Error:`, e);
            }}
            onLoad={(event) => {
              const target = event.target as HTMLImageElement;
              console.log(`ViewImageModal: Next/Image onLoad for src: ${target.src}. Natural dimensions: ${target.naturalWidth}x${target.naturalHeight}`);
            }}
            unoptimized={process.env.NODE_ENV === 'development'} 
          />
        </div>

        <DialogFooter className="pt-4 sm:pt-6 shrink-0">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
