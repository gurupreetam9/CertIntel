
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
  // console.log('ViewImageModal: Render/Update. isOpen:', isOpen, 'Image prop:', image ? image.fileId : 'null');

  if (!image) {
    if (isOpen) {
      // console.warn('ViewImageModal: isOpen is true but image prop is null.');
    }
    return null; 
  }

  const imageSrc = `/api/images/${image.fileId}`;
  // console.log(`ViewImageModal: Image source URL for ${image.originalName}: ${imageSrc}`);

  return (
    <Dialog open={isOpen} onOpenChange={(openStatus) => { 
      // console.log('ViewImageModal: Dialog onOpenChange triggered. New open status:', openStatus);
      if (!openStatus) onClose(); 
    }}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2 sm:pb-4">
          <DialogTitle className="font-headline text-lg sm:text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
        </DialogHeader>
        
        {/* This div will grow to take available vertical space */}
        <div className="flex-grow flex items-center justify-center relative min-h-0 overflow-hidden">
          {/* This div is the direct parent for next/image, defining its bounds */}
          {/* Using a green background for debugging this specific container */}
          <div className="relative w-full h-full max-w-[85vw] max-h-[75vh] bg-green-500/10">
            <Image
              key={image.fileId} 
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
              onLoadingComplete={(img) => {
                console.log(`ViewImageModal: Next/Image onLoadingComplete for src: ${img.src}. Natural dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
              }}
              unoptimized={process.env.NODE_ENV === 'development'} 
            />
          </div>
        </div>

        <DialogFooter className="pt-2 sm:pt-4">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
