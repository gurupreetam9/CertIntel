
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
import { useEffect, useState } from 'react';
import { FileText, ExternalLink, AlertTriangle } from 'lucide-react';

interface ViewImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: UserImage | null;
}

export default function ViewImageModal({ isOpen, onClose, image }: ViewImageModalProps) {
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    if (image) {
      setImageLoadError(false); // Reset error state when a new image is passed
    }
  }, [image]);

  if (!image) {
    return null;
  }

  const imageSrc = `/api/images/${image.fileId}`;
  const isPdf = image.contentType === 'application/pdf';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(openStatus) => {
        if (!openStatus) onClose();
      }}
    >
      <DialogContent
        key={image.fileId ? `${image.fileId}-dialog-content` : 'dialog-empty'}
        className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden" // Changed to overflow-hidden to prevent double scrollbars if content fits
      >
        <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-4 shrink-0 border-b">
          <DialogTitle className="font-headline text-lg sm:text-xl truncate" title={image.originalName}>
            {image.originalName}
          </DialogTitle>
           <DialogDescription className="sr-only">
            Preview of {image.originalName}. File ID is {image.fileId}.
          </DialogDescription>
        </DialogHeader>
        
        <div // This is the content stage, now handles scrolling internally if needed
          key={`${image.fileId}-content-stage`}
          className="flex-1 min-h-0 w-full flex items-center justify-center p-4 overflow-y-auto" 
        >
          {isPdf ? (
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <FileText className="w-24 h-24 text-muted-foreground" />
              <p className="text-lg font-medium">This is a PDF document.</p>
              <p className="text-sm text-muted-foreground">{image.originalName}</p>
              <Button asChild>
                <a href={imageSrc} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open PDF in new tab
                </a>
              </Button>
            </div>
          ) : imageLoadError ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 text-destructive">
              <AlertTriangle className="w-16 h-16" />
              <p className="text-lg font-medium">Image Preview Not Available</p>
              <p className="text-sm">There was an error loading this image.</p>
            </div>
          ) : (
            <Image
              key={`${image.fileId}-modal-image`}
              src={imageSrc}
              alt={`View of ${image.originalName}`}
              width={1200} 
              height={1200} 
              className="object-contain max-w-full max-h-full" 
              sizes="(max-width: 767px) 90vw, 700px" 
              priority
              data-ai-hint={image.dataAiHint || 'full view image'}
              onLoad={(event) => {
                const target = event.target as HTMLImageElement;
                console.log(`ViewImageModal: Next/Image onLoad for src: ${target.src}. Natural dimensions: ${target.naturalWidth}x${target.naturalHeight}. Styled dimensions: ${target.width}x${target.height}.`);
                setImageLoadError(false);
              }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                console.error(`ViewImageModal: Next/Image onError event for src: ${target.src}. Error:`, e);
                setImageLoadError(true);
              }}
            />
          )}
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
