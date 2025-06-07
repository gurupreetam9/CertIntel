
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
    <Dialog open={isOpen} onOpenChange={(openStatus) => { 
      console.log('ViewImageModal: Dialog onOpenChange triggered. New open status:', openStatus);
      if (!openStatus) onClose(); 
    }}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2 sm:pb-4 shrink-0">
          <DialogTitle className="font-headline text-lg sm:text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
        </DialogHeader>
        
        <div 
          key={`${image.fileId}-modal-outer-container`}
          className="flex-grow flex items-center justify-center relative min-h-0 overflow-auto bg-yellow-500/30 w-full p-2" 
        >
          {/* This div is the direct parent for next/image, defining its bounds */}
          {/* It should try to fill the yellow box. Max-w/max-h constrain the image content via objectFit="contain" */}
          <div 
            key={`${image.fileId}-modal-inner-wrapper`}
            className="relative w-full h-full max-w-[calc(95vw-4rem)] max-h-[calc(90vh-10rem)] bg-pink-500/30" // Increased bottom margin for footer
          > 
            <Image
              key={`${image.fileId}-modal-image`}
              src={imageSrc}
              alt={`View of ${image.originalName}`}
              layout="fill"
              objectFit="contain" 
              className="rounded-md" // This class is fine
              placeholder="blur"
              blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
              data-ai-hint={image.dataAiHint || 'full view image'}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                console.error(`ViewImageModal: Next/Image onError event for src: ${target.src}. Natural width: ${target.naturalWidth}. Error:`, e);
              }}
              onLoadingComplete={(img) => {
                console.log(`ViewImageModal: Next/Image onLoadingComplete for src: ${img.src}. Natural dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
              }}
              unoptimized={process.env.NODE_ENV === 'development'} 
            />
          </div>
        </div>

        <DialogFooter className="pt-2 sm:pb-0 sm:pt-4 shrink-0">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
