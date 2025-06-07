
'use client';

import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UserImage } from './ImageGrid'; // Assuming UserImage is exported or defined here

interface ViewImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: UserImage | null;
}

export default function ViewImageModal({ isOpen, onClose, image }: ViewImageModalProps) {
  if (!image) return null;

  const imageSrc = `/api/images/${image.fileId}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
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
              src={imageSrc}
              alt={`View of ${image.originalName}`}
              layout="fill"
              objectFit="contain" // Use 'contain' to ensure the whole image is visible
              className="rounded-md"
              placeholder="blur"
              blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
              data-ai-hint={image.dataAiHint || 'full view image'}
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
