
'use client';

import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UserImage } from './ImageGrid'; 

interface ViewImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: UserImage | null;
}

export default function ViewImageModal({ isOpen, onClose, image }: ViewImageModalProps) {
  // Log when the component renders or its props change
  console.log('ViewImageModal: Render/Update. isOpen:', isOpen, 'Image prop:', image);

  if (!image) {
    // If no image, don't render the modal content that depends on it, or render placeholder
    if (isOpen) {
      // This case should ideally not happen if called correctly from ImageGrid
      console.warn('ViewImageModal: isOpen is true but image prop is null.');
    }
    return null; 
  }

  const imageSrc = `/api/images/${image.fileId}`;
  console.log(`ViewImageModal: Image source URL for ${image.originalName}: ${imageSrc}`);

  return (
    <Dialog open={isOpen} onOpenChange={(openStatus) => { 
      console.log('ViewImageModal: Dialog onOpenChange triggered. New open status:', openStatus);
      if (!openStatus) onClose(); 
    }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-headline text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-grow relative my-4 flex items-center justify-center">
          {/* Set a max height and width for the image container itself */}
          <div className="relative w-full h-full max-w-[80vw] max-h-[70vh]">
            <Image
              key={image.fileId} // Adding a key can help if the src changes for the same modal instance
              src={imageSrc}
              alt={`View of ${image.originalName}`}
              layout="fill"
              objectFit="contain" // Use 'contain' to ensure the whole image is visible
              className="rounded-md"
              placeholder="blur"
              blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
              data-ai-hint={image.dataAiHint || 'full view image'}
              onError={(e) => {
                // Target type is EventTarget, cast to HTMLImageElement if needed for specific properties
                const target = e.target as HTMLImageElement;
                console.error(`ViewImageModal: Next/Image onError event for src: ${target.src}. Natural width: ${target.naturalWidth}`, e);
              }}
              onLoadingComplete={(img) => {
                console.log(`ViewImageModal: Next/Image onLoadingComplete for src: ${img.src}. Natural dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
              }}
              unoptimized={process.env.NODE_ENV === 'development'} // Try unoptimized in dev to rule out optimization issues
            />
          </div>
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

